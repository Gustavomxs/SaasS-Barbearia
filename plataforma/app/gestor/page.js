"use client";
// =====================================================================
// R10 — PAINEL GESTOR do dono (/gestor). Só quem é admin entra.
// Dashboard ao vivo · Agenda geral · Serviços · Equipe · Configurações · Cupons · Assinantes
// Tudo grava direto no Supabase; o site lê as mesmas tabelas e muda na hora.
// =====================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sb } from "../../lib/supabase";
import Agenda from "../agenda/page";
import { Cupons, Assinantes } from "../agenda/dono";

const FUSO = "America/Sao_Paulo";
const reais = (c) => "R$ " + (Number(c || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const hojeIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00-03:00"); d.setDate(d.getDate() + n); return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(d); };
const quando = (ts) => new Date(ts).toLocaleString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ABAS = [["dash", "Dashboard"], ["agenda", "Agenda"], ["servicos", "Serviços"], ["equipe", "Equipe"], ["config", "Configurações"], ["cupons", "Cupons"], ["assinantes", "Assinantes"]];

export default function Gestor() {
  const cli = useMemo(() => sb(), []);
  const [sessao, setSessao] = useState(undefined);
  const [admin, setAdmin] = useState(null);
  const [aba, setAba] = useState("dash");
  const [barbeiros, setBarbeiros] = useState([]);

  useEffect(() => {
    cli.auth.getSession().then(({ data }) => setSessao(data.session || null));
    const { data } = cli.auth.onAuthStateChange((_e, s) => setSessao(s || null));
    return () => data.subscription.unsubscribe();
  }, [cli]);
  const carregarEquipe = useCallback(async () => {
    const { data } = await cli.from("profissionais").select("*").order("unidade_id").order("ordem");
    setBarbeiros(data || []);
  }, [cli]);
  useEffect(() => {
    if (!sessao) { setAdmin(null); return; }
    cli.rpc("meu_painel").then(({ data }) => setAdmin(!!data?.admin));
    carregarEquipe();
  }, [sessao, cli, carregarEquipe]);

  if (sessao === undefined || (sessao && admin === null)) return <main className="ag"><p className="ag__aviso">Carregando…</p></main>;
  if (!sessao) return <EntrarGestor cli={cli} />;
  if (!admin) return (
    <main className="ag"><p className="ag__aviso">Esta área é só do dono da R10. Barbeiros usam a <a href="/agenda"><strong>agenda dos barbeiros</strong></a>.</p></main>
  );

  return (
    <main className="ag ag--gestor">
      <header className="ag__topo">
        <p className="ag__marca">R10 Gestor<small>Painel do dono</small></p>
        <a className="ag__sair" href="/agenda">Agenda</a>
        <button className="ag__sair" onClick={() => cli.auth.signOut()}>Sair</button>
      </header>
      <nav className="gs__abas" aria-label="Painel gestor">
        {ABAS.map(([id, nome]) => <button key={id} aria-pressed={aba === id} onClick={() => setAba(id)}>{nome}</button>)}
      </nav>
      {aba === "dash" && <Dashboard cli={cli} barbeiros={barbeiros} />}
      {aba === "agenda" && <Agenda embutido />}
      {aba === "servicos" && <Servicos cli={cli} />}
      {aba === "equipe" && <Equipe cli={cli} barbeiros={barbeiros} recarregar={carregarEquipe} />}
      {aba === "config" && <Configuracoes cli={cli} />}
      {aba === "cupons" && <Cupons cli={cli} />}
      {aba === "assinantes" && <Assinantes cli={cli} />}
    </main>
  );
}

/* ============================ DASHBOARD ============================ */
function Dashboard({ cli, barbeiros }) {
  const [ags, setAgs] = useState(null);
  const [ultimos, setUltimos] = useState([]);
  const [priv, setPriv] = useState([]);
  const [som, setSom] = useState(false);
  const somRef = useRef(false); somRef.current = som;
  const audio = useRef(null);

  const hoje = hojeIso();
  const dow = new Date(hoje + "T12:00:00-03:00").getDay();               // 0 = domingo
  const iniSemana = somaDias(hoje, -((dow + 6) % 7));                      // segunda-feira
  const iniMes = hoje.slice(0, 8) + "01";
  const desde = iniSemana < iniMes ? iniSemana : iniMes;

  const carregar = useCallback(async () => {
    const [{ data: a }, { data: u }, { data: p }] = await Promise.all([
      cli.from("agendamentos").select("id, inicio, status, total_centavos, profissional_id")
        .gte("inicio", `${desde}T00:00:00-03:00`).lt("inicio", `${somaDias(hoje, 1)}T00:00:00-03:00`),
      cli.from("agendamentos").select("id, criado_em, inicio, status, total_centavos, nome_cliente, profissional_id, agendamento_servicos(nome)")
        .order("criado_em", { ascending: false }).limit(10),
      cli.from("profissionais_privado").select("profissional_id, eh_dono, percentual_split")
    ]);
    setAgs(a || []); setUltimos(u || []); setPriv(p || []);
  }, [cli, desde, hoje]);
  useEffect(() => { carregar(); }, [carregar]);

  // ao vivo + alerta sonoro suave quando um cliente marca horário
  useEffect(() => {
    const canal = cli.channel("gestor-dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "agendamentos" }, (ev) => {
        if (ev.eventType === "INSERT" && somRef.current) tocar();
        carregar();
      }).subscribe();
    return () => { cli.removeChannel(canal); };
  }, [cli, carregar]);
  function tocar() {
    try {
      const ctx = audio.current || (audio.current = new (window.AudioContext || window.webkitAudioContext)());
      [[660, 0], [880, 0.16]].forEach(([f, t]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35);
        o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.4);
      });
    } catch {}
  }
  function ligarSom() { setSom((s) => { const n = !s; if (n) { tocar(); } return n; }); }

  const nomeDe = (id) => barbeiros.find((b) => b.id === id)?.nome || id;
  function resumo(de) {
    const lista = (ags || []).filter((a) => a.inicio >= new Date(`${de}T00:00:00-03:00`).toISOString());
    const feitos = lista.filter((a) => a.status === "concluido");
    const fat = feitos.reduce((s, a) => s + (a.total_centavos || 0), 0);
    const canc = lista.filter((a) => a.status === "cancelado").length;
    return { fat, qtd: feitos.length, ticket: feitos.length ? Math.round(fat / feitos.length) : 0, taxa: lista.length ? Math.round(canc * 100 / lista.length) : 0, marcados: lista.filter((a) => a.status === "agendado").length };
  }
  const periodos = [["Hoje", hoje], ["Semana", iniSemana], ["Mês", iniMes]].map(([n, de]) => ({ n, ...resumo(de) }));
  const ranking = barbeiros.map((b) => {
    const feitos = (ags || []).filter((a) => a.profissional_id === b.id && a.status === "concluido" && a.inicio >= new Date(`${iniMes}T00:00:00-03:00`).toISOString());
    const fat = feitos.reduce((s, a) => s + (a.total_centavos || 0), 0);
    const p = priv.find((x) => x.profissional_id === b.id) || {};
    const pct = p.eh_dono ? 0 : Number(p.percentual_split || 0);
    return { id: b.id, nome: b.nome, qtd: feitos.length, fat, pct, comissao: Math.round(fat * pct / 100), dono: !!p.eh_dono };
  }).sort((a, b) => b.fat - a.fat);

  return (
    <section>
      <div className="gs__linha">
        <p className="ag__resumo" style={{ margin: 0 }}><span className="ao-vivo"><i />ao vivo</span></p>
        <button className="ag__btn ag__btn--linha" onClick={ligarSom}>{som ? "🔊 Alerta sonoro ligado" : "🔈 Ligar alerta sonoro"}</button>
      </div>
      {!ags ? <p className="ag__aviso">Carregando…</p> : <>
        <div className="gs__cards">
          {periodos.map((p) => (
            <article className="gs__card" key={p.n}>
              <p className="gs__card-tit">{p.n}</p>
              <p className="gs__card-valor">{reais(p.fat)}</p>
              <dl>
                <div><dt>Serviços feitos</dt><dd>{p.qtd}</dd></div>
                <div><dt>Ticket médio</dt><dd>{reais(p.ticket)}</dd></div>
                <div><dt>Cancelamentos</dt><dd>{p.taxa}%</dd></div>
                <div><dt>Ainda marcados</dt><dd>{p.marcados}</dd></div>
              </dl>
            </article>
          ))}
        </div>
        <p className="ag__aviso">Faturamento = atendimentos <strong>concluídos (pagos)</strong>. Marque "Concluído" na agenda quando o cliente pagar.</p>

        <h2 className="gs__tit">Ranking do mês · comissões</h2>
        <div className="ag__lista">
          {ranking.map((r, i) => (
            <article className="cartao" key={r.id}>
              <div className="cartao__hora">{i + 1}º<small>{r.qtd} atend.</small></div>
              <p className="cartao__nome">{r.nome}{r.dono ? " (dono)" : ""}</p>
              <p className="cartao__info">{r.dono ? "Tudo fica com o dono" : r.pct ? `Comissão ${r.pct}%: ${reais(r.comissao)}` : "Defina a comissão na aba Equipe"}</p>
              <p className="cartao__valor">{reais(r.fat)}</p>
            </article>
          ))}
        </div>

        <h2 className="gs__tit">Últimos agendamentos</h2>
        <div className="ag__lista">
          {!ultimos.length && <div className="vazio"><strong>Nenhum ainda</strong>Os novos agendamentos aparecem aqui na hora.</div>}
          {ultimos.map((u) => (
            <article className={"cartao cartao--" + u.status} key={u.id}>
              <div className="cartao__hora" style={{ fontSize: "1.3rem" }}>{quando(u.inicio)}<small>marcado {quando(u.criado_em)}</small></div>
              <p className="cartao__nome">{u.nome_cliente}</p>
              <p className="cartao__info">{(u.agendamento_servicos || []).map((s) => s.nome).join(", ")} · {nomeDe(u.profissional_id)}</p>
              <p className="cartao__valor">{reais(u.total_centavos)}</p>
            </article>
          ))}
        </div>
      </>}
    </section>
  );
}

/* ============================ SERVIÇOS ============================ */
function Servicos({ cli }) {
  const [lista, setLista] = useState(null);
  const [msg, setMsg] = useState("");
  const carregar = useCallback(async () => {
    const { data } = await cli.from("servicos").select("*").order("ordem");
    setLista((data || []).map((s) => ({ ...s, preco: (s.preco_centavos / 100).toFixed(2).replace(".", ",") })));
  }, [cli]);
  useEffect(() => { carregar(); }, [carregar]);
  const muda = (id, campo, v) => setLista((l) => l.map((s) => (s.id === id ? { ...s, [campo]: v, _sujo: true } : s)));
  const centavos = (txt) => Math.round(Number(String(txt).replace(/\./g, "").replace(",", ".")) * 100);

  async function salvar(s) {
    const preco = centavos(s.preco), dur = Number(s.duracao_min);
    if (!s.nome.trim() || !(preco >= 0) || !(dur > 0)) return setMsg("Confira nome, preço e duração.");
    const { error } = await cli.from("servicos").update({ nome: s.nome.trim(), preco_centavos: preco, duracao_min: dur, destaque: !!s.destaque, ativo: !!s.ativo }).eq("id", s.id);
    setMsg(error ? "Não foi possível salvar." : `"${s.nome}" salvo. O site já mostra o novo valor.`);
    if (!error) carregar();
  }
  async function novo(e) {
    e.preventDefault();
    const f = e.currentTarget, nome = f.nome.value.trim(), preco = centavos(f.preco.value), dur = Number(f.dur.value);
    if (!nome || !(preco >= 0) || !(dur > 0)) return setMsg("Preencha nome, preço e duração.");
    const id = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const ordem = Math.max(0, ...(lista || []).map((s) => s.ordem || 0)) + 1;
    const { error } = await cli.from("servicos").insert({ id, nome, preco_centavos: preco, duracao_min: dur, ordem, ativo: true });
    setMsg(error ? (/duplicate/i.test(error.message) ? "Já existe um serviço com esse nome." : "Não foi possível criar.") : `"${nome}" criado e já aparece no site.`);
    if (!error) { f.reset(); carregar(); }
  }

  return (
    <section>
      {msg && <p className="ag__aviso">{msg}</p>}
      {!lista ? <p className="ag__aviso">Carregando…</p> : (
        <div className="ag__lista">
          {lista.map((s) => (
            <article className={"gs__item" + (s.ativo ? "" : " gs__item--off")} key={s.id}>
              <label className="campo campo--largo">Nome<input value={s.nome} onChange={(e) => muda(s.id, "nome", e.target.value)} maxLength={60} /></label>
              <label className="campo">Preço (R$)<input inputMode="decimal" value={s.preco} onChange={(e) => muda(s.id, "preco", e.target.value)} /></label>
              <label className="campo">Duração (min)<input type="number" min="5" step="5" value={s.duracao_min} onChange={(e) => muda(s.id, "duracao_min", e.target.value)} /></label>
              <label className="gs__chave"><input type="checkbox" checked={!!s.ativo} onChange={(e) => muda(s.id, "ativo", e.target.checked)} /> Ativo no site</label>
              <label className="gs__chave"><input type="checkbox" checked={!!s.destaque} onChange={(e) => muda(s.id, "destaque", e.target.checked)} /> "Mais pedido"</label>
              <button className={"ag__btn " + (s._sujo ? "ag__btn--vinho" : "ag__btn--linha")} onClick={() => salvar(s)}>{s._sujo ? "Salvar" : "Salvo"}</button>
            </article>
          ))}
        </div>
      )}
      <form className="ag__bloquear" onSubmit={novo}>
        <h2>Novo serviço ou combo</h2>
        <div className="campos">
          <label className="campo campo--largo">Nome<input name="nome" placeholder="Ex.: Corte + barba + sobrancelha" maxLength={60} /></label>
          <label className="campo">Preço (R$)<input name="preco" inputMode="decimal" placeholder="60,00" /></label>
          <label className="campo">Duração (min)<input name="dur" type="number" min="5" step="5" defaultValue="30" /></label>
        </div>
        <button className="ag__btn ag__btn--vinho" type="submit">Criar serviço</button>
      </form>
    </section>
  );
}

/* ============================ EQUIPE ============================ */
const t5 = (t) => (t ? String(t).slice(0, 5) : "");
function Equipe({ cli, barbeiros, recarregar }) {
  const [exps, setExps] = useState([]);
  const [priv, setPriv] = useState([]);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState("");
  const carregar = useCallback(async () => {
    const [{ data: e }, { data: p }] = await Promise.all([
      cli.from("expedientes").select("*"), cli.from("profissionais_privado").select("profissional_id, eh_dono, percentual_split")
    ]);
    setExps(e || []); setPriv(p || []);
  }, [cli]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const f = {};
    barbeiros.forEach((b) => {
      const sem = exps.find((x) => x.profissional_id === b.id && x.dia_semana === 1), sab = exps.find((x) => x.profissional_id === b.id && x.dia_semana === 6);
      const p = priv.find((x) => x.profissional_id === b.id) || {};
      f[b.id] = { nome: b.nome, telefone: b.telefone || "", ativo: b.ativo, foto_url: b.foto_url || "", almoco_inicio: t5(b.almoco_inicio), almoco_fim: t5(b.almoco_fim),
        sem_ini: t5(sem?.inicio) || "09:00", sem_fim: t5(sem?.fim) || "19:30", sab_ini: t5(sab?.inicio), sab_fim: t5(sab?.fim), trabalha_sab: !!sab,
        eh_dono: !!p.eh_dono, pct: p.percentual_split ?? "" };
    });
    setForm(f);
  }, [barbeiros, exps, priv]);
  const muda = (id, campo, v) => setForm((f) => ({ ...f, [id]: { ...f[id], [campo]: v, _sujo: true } }));

  async function enviarFoto(id, arquivo) {
    if (!arquivo) return;
    setMsg("Enviando foto…");
    const ext = (arquivo.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const caminho = `${id}-${Date.now()}.${ext}`;
    const { error } = await cli.storage.from("equipe").upload(caminho, arquivo, { contentType: arquivo.type, upsert: true });
    if (error) return setMsg("Não foi possível enviar a foto.");
    const { data } = cli.storage.from("equipe").getPublicUrl(caminho);
    muda(id, "foto_url", data.publicUrl); setMsg("Foto pronta — clique em Salvar.");
  }
  async function salvar(id) {
    const f = form[id];
    if (f.almoco_inicio && f.almoco_fim && f.almoco_fim <= f.almoco_inicio) return setMsg("O fim do almoço precisa ser depois do início.");
    if (!(f.sem_fim > f.sem_ini) || (f.trabalha_sab && !(f.sab_fim > f.sab_ini))) return setMsg("Confira os horários de expediente.");
    const r1 = await cli.from("profissionais").update({ nome: f.nome.trim(), telefone: f.telefone.replace(/\D/g, "") || null, ativo: !!f.ativo, foto_url: f.foto_url || null,
      almoco_inicio: f.almoco_inicio || null, almoco_fim: f.almoco_fim || null }).eq("id", id);
    const r2 = await cli.from("expedientes").delete().eq("profissional_id", id);
    const linhas = [1, 2, 3, 4, 5].map((d) => ({ profissional_id: id, dia_semana: d, inicio: f.sem_ini, fim: f.sem_fim }));
    if (f.trabalha_sab) linhas.push({ profissional_id: id, dia_semana: 6, inicio: f.sab_ini, fim: f.sab_fim });
    const r3 = await cli.from("expedientes").insert(linhas);
    const r4 = await cli.from("profissionais_privado").update({ eh_dono: !!f.eh_dono, percentual_split: f.eh_dono || f.pct === "" ? null : Number(f.pct) }).eq("profissional_id", id);
    const erro = r1.error || r2.error || r3.error || r4.error;
    setMsg(erro ? "Não foi possível salvar tudo. Confira os campos." : `${f.nome} salvo. Os horários do site já mudaram.`);
    if (!erro) { recarregar(); carregar(); }
  }

  return (
    <section>
      {msg && <p className="ag__aviso">{msg}</p>}
      <div className="ag__lista">
        {barbeiros.map((b) => { const f = form[b.id]; if (!f) return null; return (
          <article className={"gs__item" + (f.ativo ? "" : " gs__item--off")} key={b.id}>
            <div className="gs__foto">{f.foto_url ? <img src={f.foto_url.startsWith("/") ? f.foto_url : f.foto_url} alt="" /> : <span>{f.nome[0]}</span>}
              <label className="ag__btn ag__btn--linha">Trocar foto<input type="file" accept="image/*" hidden onChange={(e) => enviarFoto(b.id, e.target.files[0])} /></label></div>
            <label className="campo">Nome<input value={f.nome} onChange={(e) => muda(b.id, "nome", e.target.value)} /></label>
            <label className="campo">Telefone<input value={f.telefone} inputMode="tel" onChange={(e) => muda(b.id, "telefone", e.target.value)} placeholder="43999999999" /></label>
            <label className="campo">Seg a sex: início<input type="time" step="1800" value={f.sem_ini} onChange={(e) => muda(b.id, "sem_ini", e.target.value)} /></label>
            <label className="campo">Seg a sex: fim<input type="time" step="1800" value={f.sem_fim} onChange={(e) => muda(b.id, "sem_fim", e.target.value)} /></label>
            <label className="gs__chave campo--largo"><input type="checkbox" checked={f.trabalha_sab} onChange={(e) => muda(b.id, "trabalha_sab", e.target.checked)} /> Trabalha no sábado</label>
            {f.trabalha_sab && <>
              <label className="campo">Sábado: início<input type="time" step="1800" value={f.sab_ini} onChange={(e) => muda(b.id, "sab_ini", e.target.value)} /></label>
              <label className="campo">Sábado: fim<input type="time" step="1800" value={f.sab_fim} onChange={(e) => muda(b.id, "sab_fim", e.target.value)} /></label>
            </>}
            <label className="campo">Almoço: início<input type="time" step="1800" value={f.almoco_inicio} onChange={(e) => muda(b.id, "almoco_inicio", e.target.value)} /></label>
            <label className="campo">Almoço: fim<input type="time" step="1800" value={f.almoco_fim} onChange={(e) => muda(b.id, "almoco_fim", e.target.value)} /></label>
            <label className="gs__chave"><input type="checkbox" checked={f.eh_dono} onChange={(e) => muda(b.id, "eh_dono", e.target.checked)} /> É o dono (fica com 100%)</label>
            {!f.eh_dono && <label className="campo">Comissão do barbeiro (%)<input type="number" min="0" max="100" value={f.pct} onChange={(e) => muda(b.id, "pct", e.target.value)} /></label>}
            <label className="gs__chave"><input type="checkbox" checked={!!f.ativo} onChange={(e) => muda(b.id, "ativo", e.target.checked)} /> Ativo (aparece no site)</label>
            <button className={"ag__btn " + (f._sujo ? "ag__btn--vinho" : "ag__btn--linha")} onClick={() => salvar(b.id)}>{f._sujo ? "Salvar" : "Salvo"}</button>
          </article>
        ); })}
      </div>
    </section>
  );
}

/* ============================ CONFIGURAÇÕES ============================ */
function Configuracoes({ cli }) {
  const [c, setC] = useState(null);
  const [unidades, setUnidades] = useState([]);
  const [msg, setMsg] = useState("");
  const carregar = useCallback(async () => {
    const [{ data: cfg }, { data: u }] = await Promise.all([cli.from("configuracoes").select("*").maybeSingle(), cli.from("unidades").select("*").order("ordem")]);
    setC(cfg); setUnidades(u || []);
  }, [cli]);
  useEffect(() => { carregar(); }, [carregar]);
  if (!c) return <p className="ag__aviso">Carregando…</p>;
  const muda = (k, v) => setC({ ...c, [k]: v });

  async function salvar(e) {
    e.preventDefault();
    const { error } = await cli.from("configuracoes").update({
      aberta: !!c.aberta, whatsapp: String(c.whatsapp).replace(/\D/g, ""), instagram: String(c.instagram).replace(/^@/, "").trim(),
      aviso_ativo: !!c.aviso_ativo, aviso_texto: (c.aviso_texto || "").trim() || null,
      prazo_cancelar_horas: Number(c.prazo_cancelar_horas), max_futuros: Number(c.max_futuros), dias_a_frente: Number(c.dias_a_frente), antecedencia_min: Number(c.antecedencia_min)
    }).eq("id", true);
    let erroU = null;
    for (const u of unidades) { const r = await cli.from("unidades").update({ nome: u.nome, endereco: u.endereco, maps_url: u.maps_url || null }).eq("id", u.id); erroU = erroU || r.error; }
    setMsg(error || erroU ? "Não foi possível salvar." : "Salvo! O site já está com as novas configurações.");
  }

  return (
    <form onSubmit={salvar}>
      {msg && <p className="ag__aviso">{msg}</p>}
      <div className={"gs__status " + (c.aberta ? "gs__status--aberta" : "gs__status--fechada")}>
        <strong>{c.aberta ? "Barbearia ABERTA" : "Barbearia FECHADA"}</strong>
        <span>{c.aberta ? "O site está oferecendo horários." : "O site não oferece horários e mostra o aviso de fechada."}</span>
        <button type="button" className="ag__btn" onClick={() => muda("aberta", !c.aberta)}>{c.aberta ? "Fechar a barbearia" : "Abrir a barbearia"}</button>
      </div>
      <div className="ag__bloquear" style={{ marginTop: 14 }}>
        <h2>Aviso no topo do site</h2>
        <label className="campo campo--largo">Texto do aviso<input value={c.aviso_texto || ""} onChange={(e) => muda("aviso_texto", e.target.value)} placeholder="Ex.: Promoção: corte + barba por R$ 50 nesta semana!" maxLength={140} /></label>
        <label className="gs__chave" style={{ marginTop: 10 }}><input type="checkbox" checked={!!c.aviso_ativo} onChange={(e) => muda("aviso_ativo", e.target.checked)} /> Mostrar o aviso no site</label>
      </div>
      <div className="ag__bloquear">
        <h2>Contato e redes</h2>
        <div className="campos">
          <label className="campo">WhatsApp oficial (com DDD)<input value={c.whatsapp || ""} inputMode="tel" onChange={(e) => muda("whatsapp", e.target.value)} /></label>
          <label className="campo">Instagram<input value={c.instagram || ""} onChange={(e) => muda("instagram", e.target.value)} placeholder="r10._barbearia" /></label>
        </div>
      </div>
      <div className="ag__bloquear">
        <h2>Unidades e endereços</h2>
        {unidades.map((u, i) => (
          <div className="campos" key={u.id}>
            <label className="campo">Nome<input value={u.nome} onChange={(e) => setUnidades(unidades.map((x, k) => (k === i ? { ...x, nome: e.target.value } : x)))} /></label>
            <label className="campo">Link do mapa<input value={u.maps_url || ""} onChange={(e) => setUnidades(unidades.map((x, k) => (k === i ? { ...x, maps_url: e.target.value } : x)))} /></label>
            <label className="campo campo--largo">Endereço<input value={u.endereco} onChange={(e) => setUnidades(unidades.map((x, k) => (k === i ? { ...x, endereco: e.target.value } : x)))} /></label>
          </div>
        ))}
      </div>
      <div className="ag__bloquear">
        <h2>Regras do agendamento</h2>
        <div className="campos">
          <label className="campo">Cancelar até (horas antes)<input type="number" min="0" max="72" value={c.prazo_cancelar_horas} onChange={(e) => muda("prazo_cancelar_horas", e.target.value)} /></label>
          <label className="campo">Horários futuros por cliente<input type="number" min="1" max="10" value={c.max_futuros} onChange={(e) => muda("max_futuros", e.target.value)} /></label>
          <label className="campo">Agenda aberta (dias à frente)<input type="number" min="1" max="90" value={c.dias_a_frente} onChange={(e) => muda("dias_a_frente", e.target.value)} /></label>
          <label className="campo">Antecedência mínima (min)<input type="number" min="0" max="1440" step="15" value={c.antecedencia_min} onChange={(e) => muda("antecedencia_min", e.target.value)} /></label>
        </div>
      </div>
      <button className="ag__btn ag__btn--vinho" type="submit" style={{ width: "100%", marginTop: 6 }}>Salvar configurações</button>
    </form>
  );
}

function EntrarGestor({ cli }) {
  const [erro, setErro] = useState("");
  async function enviar(e) {
    e.preventDefault(); const f = e.currentTarget; setErro("");
    const { error } = await cli.auth.signInWithPassword({ email: f.email.value.trim().toLowerCase(), password: f.senha.value });
    if (error) setErro("E-mail ou senha incorretos.");
  }
  return (
    <main className="ag">
      <form className="login" onSubmit={enviar}>
        <h1>R10 Gestor</h1><p>Área do dono da barbearia.</p>
        <label className="campo">E-mail<input name="email" type="email" autoComplete="email" required /></label>
        <label className="campo">Senha<input name="senha" type="password" autoComplete="current-password" required /></label>
        {erro && <p className="erro">{erro}</p>}
        <button className="ag__btn ag__btn--vinho" type="submit">Entrar</button>
      </form>
    </main>
  );
}
