"use client";
// Partes do painel que só o DONO (admin) vê: Relatório, Cupons e Assinantes.
import { useCallback, useEffect, useState } from "react";

const FUSO = "America/Sao_Paulo";
const reais = (c) => "R$ " + (Number(c || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const hojeIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
const data = (ts) => (ts ? new Date(ts.length === 10 ? ts + "T12:00:00-03:00" : ts).toLocaleDateString("pt-BR", { timeZone: FUSO }) : "—");
const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00-03:00"); d.setDate(d.getDate() + n); return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(d); };

/* ===================== RELATÓRIO ===================== */
export function Relatorio({ cli, barbeiros }) {
  const [de, setDe] = useState(hojeIso().slice(0, 8) + "01");
  const [ate, setAte] = useState(hojeIso());
  const [linhas, setLinhas] = useState(null);
  const carregar = useCallback(async () => {
    setLinhas(null);
    const [{ data: ags }, { data: priv }] = await Promise.all([
      cli.from("agendamentos").select("profissional_id, status, total_centavos, desconto_centavos")
        .gte("inicio", `${de}T00:00:00-03:00`).lt("inicio", `${somaDias(ate, 1)}T00:00:00-03:00`).in("status", ["agendado", "concluido"]),
      cli.from("profissionais_privado").select("profissional_id, eh_dono, percentual_split")
    ]);
    const porB = {};
    (ags || []).forEach((a) => {
      const b = (porB[a.profissional_id] ||= { feitos: 0, marcados: 0, total: 0, cupons: 0 });
      if (a.status === "concluido") { b.feitos++; b.total += a.total_centavos || 0; } else b.marcados++;
      if (a.desconto_centavos) b.cupons += a.desconto_centavos;
    });
    setLinhas(barbeiros.map((b) => {
      const p = (priv || []).find((x) => x.profissional_id === b.id) || {};
      const r = porB[b.id] || { feitos: 0, marcados: 0, total: 0, cupons: 0 };
      const pct = p.eh_dono ? 0 : Number(p.percentual_split || 0);
      const parte = Math.round(r.total * pct / 100);
      return { ...b, ...r, pct, parte, dono: r.total - parte, ehDono: !!p.eh_dono };
    }));
  }, [cli, de, ate, barbeiros]);
  useEffect(() => { if (barbeiros.length) carregar(); }, [carregar, barbeiros.length]);

  const soma = (k) => (linhas || []).reduce((s, l) => s + l[k], 0);
  return (
    <section>
      <div className="campos">
        <label className="campo">De<input type="date" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} /></label>
        <label className="campo">Até<input type="date" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} /></label>
      </div>
      <p className="ag__aviso">Conta os atendimentos <strong>concluídos</strong> (todos pagos na barbearia por enquanto). A parte de cada barbeiro usa a porcentagem cadastrada para ele; o dono fica com 100% dos próprios atendimentos.</p>
      {!linhas ? <p className="ag__aviso">Carregando…</p> : (
        <div className="ag__lista">
          {linhas.map((l) => (
            <article className="cartao" key={l.id}>
              <div className="cartao__hora">{l.feitos}<small>feitos</small></div>
              <p className="cartao__nome">{l.nome}{l.ehDono ? " (dono)" : ""}</p>
              <p className="cartao__info">{l.marcados} marcado(s) ainda · cupons: {reais(l.cupons)}</p>
              <p className="cartao__valor">{reais(l.total)}</p>
              <p className="cartao__info" style={{ gridColumn: "1 / -1" }}>
                {l.ehDono ? "Tudo fica com o dono." : l.pct ? `Barbeiro (${l.pct}%): ${reais(l.parte)} · Dono: ${reais(l.dono)}` : "Porcentagem do barbeiro ainda não cadastrada."}
              </p>
            </article>
          ))}
          <article className="cartao" style={{ background: "var(--vinho)" }}>
            <div className="cartao__hora">{soma("feitos")}<small>no total</small></div>
            <p className="cartao__nome">Total da barbearia</p>
            <p className="cartao__info">{data(de)} a {data(ate)}</p>
            <p className="cartao__valor">{reais(soma("total"))}</p>
          </article>
        </div>
      )}
    </section>
  );
}

/* ===================== CUPONS ===================== */
const VAZIO = { id: null, codigo: "", premio: "", tipo: "servico", servico_id: "corte", plano_id: "corte-ilimitado", dias_validade: 30, resgatar_ate: "" };
export function Cupons({ cli }) {
  const [lista, setLista] = useState(null);
  const [pessoas, setPessoas] = useState({});
  const [servicos, setServicos] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [f, setF] = useState(VAZIO);
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async () => {
    const { data: cs } = await cli.from("cupons").select("*").order("criado_em", { ascending: false });
    setLista(cs || []);
    const ids = [...new Set((cs || []).map((c) => c.resgatado_por).filter(Boolean))];
    if (ids.length) {
      const { data: ps } = await cli.from("perfis").select("id, nome, email, telefone").in("id", ids);
      setPessoas(Object.fromEntries((ps || []).map((p) => [p.id, p])));
    }
  }, [cli]);
  useEffect(() => {
    carregar();
    cli.from("servicos").select("id, nome").order("ordem").then(({ data: d }) => setServicos(d || []));
    cli.from("planos").select("id, nome").order("ordem").then(({ data: d }) => setPlanos(d || []));
  }, [carregar, cli]);

  async function salvar(e) {
    e.preventDefault(); setMsg("");
    const codigo = f.codigo.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (codigo.length < 3) return setMsg("O código precisa ter pelo menos 3 letras ou números.");
    if (f.premio.trim().length < 2) return setMsg("Escreva o prêmio (ex.: Vale 1 corte).");
    const dados = {
      codigo, premio: f.premio.trim(), tipo: f.tipo,
      servico_id: f.tipo === "servico" ? f.servico_id : null,
      plano_id: f.tipo === "plano" ? f.plano_id : null,
      dias_validade: Math.max(1, Math.min(365, Number(f.dias_validade) || 30)),
      resgatar_ate: f.resgatar_ate || null
    };
    const { error } = f.id ? await cli.from("cupons").update(dados).eq("id", f.id) : await cli.from("cupons").insert(dados);
    if (error) return setMsg(/duplicate|unique/i.test(error.message) ? "Já existe um cupom com esse código." : "Não foi possível salvar o cupom.");
    setMsg(f.id ? "Cupom atualizado." : `Cupom ${codigo} criado. Divulgue o código no Instagram!`);
    setF(VAZIO); carregar();
  }
  async function acao(c, tipo) {
    let r;
    if (tipo === "ativo") r = await cli.from("cupons").update({ ativo: !c.ativo }).eq("id", c.id);
    if (tipo === "usado") r = await cli.from("cupons").update({ usado_em: new Date().toISOString() }).eq("id", c.id);
    if (tipo === "excluir") { if (!confirm(`Excluir o cupom ${c.codigo}?`)) return; r = await cli.from("cupons").delete().eq("id", c.id); }
    if (r?.error) return setMsg("Não foi possível fazer isso agora.");
    carregar();
  }

  const situacao = (c) => {
    if (!c.resgatado_por) return c.ativo ? ["Esperando resgate", ""] : ["Desativado", "off"];
    const vencido = new Date(c.expira_em) < new Date();
    if (c.tipo === "plano") return vencido ? ["Plano encerrado", "off"] : ["Plano ativo", "ok"];
    if (c.usado_em) return ["Usado / entregue", "off"];
    return vencido ? ["Vencido", "off"] : ["Resgatado · disponível", "ok"];
  };

  return (
    <section>
      <form className="ag__bloquear" style={{ marginTop: 0, marginBottom: 16 }} onSubmit={salvar}>
        <h2>{f.id ? "Editar cupom" : "Novo cupom"}</h2>
        <div className="campos">
          <label className="campo">Código<input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value.toUpperCase() })} placeholder="R10SORTE" maxLength={24} disabled={!!(f.id && lista?.find((c) => c.id === f.id)?.resgatado_por)} /></label>
          <label className="campo">Tipo
            <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              <option value="servico">Serviço grátis</option><option value="plano">Plano grátis</option><option value="outro">Outro prêmio</option>
            </select>
          </label>
          <label className="campo campo--largo">Prêmio (o que a pessoa vê)<input value={f.premio} onChange={(e) => setF({ ...f, premio: e.target.value })} placeholder="Vale 1 luzes · Vale 1 mês de plano grátis" maxLength={80} /></label>
          {f.tipo === "servico" && <label className="campo campo--largo">Serviço que fica de graça
            <select value={f.servico_id} onChange={(e) => setF({ ...f, servico_id: e.target.value })}>{servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>}
          {f.tipo === "plano" && <label className="campo campo--largo">Plano
            <select value={f.plano_id} onChange={(e) => setF({ ...f, plano_id: e.target.value })}>{planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>}
          <label className="campo">{f.tipo === "plano" ? "Dias de plano" : "Validade (dias)"}<input type="number" min="1" max="365" value={f.dias_validade} onChange={(e) => setF({ ...f, dias_validade: e.target.value })} /></label>
          <label className="campo">Resgatar até (opcional)<input type="date" value={f.resgatar_ate || ""} onChange={(e) => setF({ ...f, resgatar_ate: e.target.value })} /></label>
        </div>
        {msg && <p className="ag__aviso">{msg}</p>}
        <div className="cartao__acoes" style={{ marginTop: 0 }}>
          <button className="ag__btn ag__btn--vinho" type="submit">{f.id ? "Salvar alterações" : "Criar cupom"}</button>
          {f.id && <button type="button" className="ag__btn ag__btn--linha" onClick={() => setF(VAZIO)}>Cancelar edição</button>}
        </div>
      </form>

      {!lista ? <p className="ag__aviso">Carregando…</p> : !lista.length ? <div className="vazio"><strong>Nenhum cupom</strong>Crie o primeiro acima.</div> : (
        <div className="ag__lista">
          {lista.map((c) => {
            const [txt, cls] = situacao(c), p = pessoas[c.resgatado_por];
            return (
              <article className={"cartao" + (cls === "off" ? " cartao--concluido" : "")} key={c.id} style={cls === "ok" ? { boxShadow: "inset 0 0 0 2px #2E9E5B" } : undefined}>
                <div className="cartao__hora" style={{ fontSize: "1.2rem" }}>{c.codigo}</div>
                <p className="cartao__nome">{c.premio}</p>
                <p className="cartao__info"><span className={"selo" + (cls === "ok" ? " selo--concluido" : cls === "off" ? " selo--cancelado" : "")}>{txt}</span></p>
                <p className="cartao__info">
                  {c.resgatado_por ? `Resgatado por ${p?.nome || p?.email || "cliente"} em ${data(c.resgatado_em)} · vale até ${data(c.expira_em)}` : `Vale ${c.dias_validade} dia(s) depois do resgate${c.resgatar_ate ? ` · resgatar até ${data(c.resgatar_ate)}` : ""}`}
                  {c.usado_em && c.tipo !== "plano" ? ` · usado em ${data(c.usado_em)}` : ""}
                </p>
                <div className="cartao__acoes">
                  {!c.resgatado_por && <button className="ag__btn" onClick={() => setF({ ...VAZIO, ...c, resgatar_ate: c.resgatar_ate || "", servico_id: c.servico_id || "corte", plano_id: c.plano_id || "corte-ilimitado" })}>Editar</button>}
                  {!c.resgatado_por && <button className="ag__btn ag__btn--linha" onClick={() => acao(c, "ativo")}>{c.ativo ? "Desativar" : "Ativar"}</button>}
                  {!c.resgatado_por && <button className="ag__btn ag__btn--linha" onClick={() => acao(c, "excluir")}>Excluir</button>}
                  {c.resgatado_por && !c.usado_em && c.tipo !== "plano" && <button className="ag__btn ag__btn--ok" onClick={() => acao(c, "usado")}>Marcar como entregue</button>}
                  {p?.telefone && <a className="ag__btn ag__btn--linha" href={`https://wa.me/55${p.telefone}`} target="_blank" rel="noopener">WhatsApp</a>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ===================== ASSINANTES ===================== */
export function Assinantes({ cli }) {
  const [lista, setLista] = useState(null);
  const [pessoas, setPessoas] = useState({});
  const carregar = useCallback(async () => {
    const { data: as } = await cli.from("assinaturas").select("id, cliente_id, status, inicio, fim, origem, criado_em, planos(nome, preco_centavos)").order("criado_em", { ascending: false });
    setLista(as || []);
    const ids = [...new Set((as || []).map((a) => a.cliente_id))];
    if (ids.length) {
      const { data: ps } = await cli.from("perfis").select("id, nome, email, telefone").in("id", ids);
      setPessoas(Object.fromEntries((ps || []).map((p) => [p.id, p])));
    }
  }, [cli]);
  useEffect(() => { carregar(); }, [carregar]);

  async function mudar(a, tipo) {
    const hoje = hojeIso();
    const dados = tipo === "ativar" ? { status: "ativa", inicio: a.inicio || hoje, fim: somaDias(a.fim && a.fim > hoje ? a.fim : hoje, 30) }
      : { status: "inativa" };
    const { error } = await cli.from("assinaturas").update(dados).eq("id", a.id);
    if (!error) carregar();
  }
  const venceu = (a) => a.status === "ativa" && a.fim && a.fim < hojeIso();

  return !lista ? <p className="ag__aviso">Carregando…</p> : !lista.length ? <div className="vazio"><strong>Nenhum assinante</strong>Os pedidos de plano feitos no site aparecem aqui.</div> : (
    <div className="ag__lista">
      {lista.map((a) => {
        const p = pessoas[a.cliente_id];
        const st = venceu(a) ? "Vencido" : a.status === "ativa" ? "Ativo" : a.status === "pendente" ? "Pedido novo" : "Inativo";
        return (
          <article className={"cartao" + (st === "Inativo" ? " cartao--concluido" : "")} key={a.id}>
            <div className="cartao__hora" style={{ fontSize: "1.1rem" }}>{a.planos?.nome || "Plano"}<small>{a.origem === "cupom" ? "ganhou no cupom" : "pelo site"}</small></div>
            <p className="cartao__nome">{p?.nome || p?.email || "Cliente"}</p>
            <p className="cartao__info"><span className={"selo" + (st === "Ativo" ? " selo--concluido" : st === "Pedido novo" ? "" : " selo--cancelado")}>{st}</span> {a.fim ? `vence em ${data(a.fim)}` : ""}</p>
            <p className="cartao__valor">{a.planos ? reais(a.planos.preco_centavos) + "/mês" : ""}</p>
            <div className="cartao__acoes">
              <button className="ag__btn ag__btn--ok" onClick={() => mudar(a, "ativar")}>{a.status === "ativa" ? "Renovar +30 dias" : "Ativar 30 dias"}</button>
              {a.status !== "inativa" && <button className="ag__btn ag__btn--linha" onClick={() => mudar(a, "inativar")}>Desativar</button>}
              {p?.telefone && <a className="ag__btn ag__btn--linha" href={`https://wa.me/55${p.telefone}`} target="_blank" rel="noopener">WhatsApp</a>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
