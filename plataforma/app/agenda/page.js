"use client";
// =====================================================================
// R10 Agenda — painel dos barbeiros (/agenda), instalável no celular (PWA)
//  · login de cada barbeiro (o dono/admin vê todos e a aba "Todos")
//  · abas com o nome de cada barbeiro, dia, horários em ordem, valor e WhatsApp do cliente
//  · concluir / cancelar / bloquear horário (folga, almoço)
//  · "Ativar notificações neste celular" (Web Push) e atualização ao vivo (Supabase Realtime)
// =====================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sb } from "../../lib/supabase";
import { Relatorio, Cupons, Assinantes } from "./dono";

const MODOS = [["agenda", "Agenda"], ["relatorio", "Relatório"], ["cupons", "Cupons"], ["assinantes", "Assinantes"]];

const FUSO = "America/Sao_Paulo";
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const hojeIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());   // AAAA-MM-DD
const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00-03:00"); d.setDate(d.getDate() + n); return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(d); };
const hora = (ts) => new Date(ts).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const reais = (c) => "R$ " + (Number(c || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const diaLongo = (iso) => new Date(iso + "T12:00:00-03:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const soDig = (v) => String(v || "").replace(/\D/g, "");
function chaveVapid(b64) {
  const p = "=".repeat((4 - (b64.length % 4)) % 4), s = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
}

// embutido = dentro do /gestor (sem topo, sem notificações, sem menu do dono)
export default function Agenda({ embutido = false } = {}) {
  const cli = useMemo(() => sb(), []);
  const [sessao, setSessao] = useState(undefined);        // undefined = carregando
  const [quem, setQuem] = useState(null);                 // { admin, profissional, nome }
  const [barbeiros, setBarbeiros] = useState([]);
  const [aba, setAba] = useState(null);                   // id do barbeiro ou "todos"
  const [dia, setDia] = useState(hojeIso());
  const [itens, setItens] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [modo, setModo] = useState("agenda");             // só o dono troca: agenda / relatório / cupons / assinantes

  /* ---------- sessão ---------- */
  useEffect(() => {
    cli.auth.getSession().then(({ data }) => setSessao(data.session || null));
    const { data } = cli.auth.onAuthStateChange((_e, s) => setSessao(s || null));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/agenda" }).catch(() => {});
    return () => data.subscription.unsubscribe();
  }, [cli]);

  useEffect(() => {
    if (!sessao) { setQuem(null); return; }
    (async () => {
      const [{ data: eu }, { data: lista }] = await Promise.all([
        cli.rpc("meu_painel"),
        cli.from("profissionais").select("id, nome, unidade_id, ordem").eq("ativo", true).order("unidade_id").order("ordem")
      ]);
      setQuem(eu || { admin: false });
      setBarbeiros(lista || []);
      setAba((a) => a || (eu?.admin ? "todos" : eu?.profissional) || null);
    })();
  }, [sessao, cli]);

  const abas = useMemo(() => {
    if (!quem) return [];
    if (quem.admin) return [...barbeiros.map((b) => ({ id: b.id, nome: b.nome })), { id: "todos", nome: "Todos" }];
    return quem.profissional ? [{ id: quem.profissional, nome: quem.nome || "Minha agenda" }] : [];
  }, [quem, barbeiros]);

  /* ---------- horários do dia ---------- */
  const carregar = useCallback(async () => {
    if (!aba) return;
    setCarregando(true);
    const ini = `${dia}T00:00:00-03:00`, fim = `${somaDias(dia, 1)}T00:00:00-03:00`;
    let q = cli.from("agendamentos")
      .select("id, inicio, fim, status, confirmado_em, total_centavos, nome_cliente, telefone_cliente, profissional_id, agendamento_servicos(nome)")
      .gte("inicio", ini).lt("inicio", fim).order("inicio");
    let qb = cli.from("bloqueios").select("id, inicio, fim, motivo, profissional_id").lt("inicio", fim).gt("fim", ini).order("inicio");
    if (aba !== "todos") { q = q.eq("profissional_id", aba); qb = qb.or(`profissional_id.eq.${aba},profissional_id.is.null`); }
    const [{ data: a, error }, { data: b }] = await Promise.all([q, qb]);
    if (error) setAviso("Não foi possível carregar a agenda. Confira a internet.");
    setItens(a || []); setBloqueios(b || []); setCarregando(false);
  }, [aba, dia, cli]);
  useEffect(() => { carregar(); }, [carregar]);

  /* ---------- ao vivo: novo agendamento aparece sem recarregar ---------- */
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;
  const [aoVivo, setAoVivo] = useState(false);
  useEffect(() => {
    if (!sessao || !aba) return;
    const canal = cli.channel("agenda-" + aba)
      .on("postgres_changes", { event: "*", schema: "public", table: "agendamentos", ...(aba !== "todos" ? { filter: `profissional_id=eq.${aba}` } : {}) },
          () => carregarRef.current())
      .subscribe((st) => setAoVivo(st === "SUBSCRIBED"));
    return () => { cli.removeChannel(canal); setAoVivo(false); };
  }, [sessao, aba, cli]);

  /* ---------- ações ---------- */
  async function mudarStatus(id, status) {
    if (status === "cancelado" && !confirm("Cancelar este horário? Ele fica livre para outra pessoa.")) return;
    const { error } = await cli.rpc("painel_status", { p_id: id, p_status: status });
    if (error) return setAviso("Não foi possível mudar o horário.");
    carregar();
  }
  async function bloquear(e) {
    e.preventDefault();
    const f = e.currentTarget, prof = aba === "todos" ? f.prof.value : aba;
    const ini = f.ini.value, fim = f.fim.value;
    if (!prof || !ini || !fim || fim <= ini) return setAviso("Escolha o barbeiro e um horário de início e de fim.");
    const { error } = await cli.from("bloqueios").insert({
      profissional_id: prof, inicio: `${dia}T${ini}:00-03:00`, fim: `${dia}T${fim}:00-03:00`, motivo: f.motivo.value.trim() || "Bloqueado"
    });
    if (error) return setAviso("Não foi possível bloquear esse horário.");
    f.reset(); setAviso(""); carregar();
  }
  async function desbloquear(id) {
    const { error } = await cli.from("bloqueios").delete().eq("id", id);
    if (error) return setAviso("Não foi possível liberar esse horário.");
    carregar();
  }

  /* ---------- notificações neste celular ---------- */
  const [pushPara, setPushPara] = useState("");
  const [pushMsg, setPushMsg] = useState("");
  const ios = typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent);
  const instalado = typeof window !== "undefined" && (matchMedia("(display-mode: standalone)").matches || navigator.standalone);
  async function ativarPush() {
    const prof = quem?.admin ? (pushPara || (aba !== "todos" ? aba : "")) : quem?.profissional;
    if (!prof) return setPushMsg("Escolha quem usa este celular.");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return setPushMsg(ios && !instalado ? "No iPhone: toque em Compartilhar → “Adicionar à Tela de Início”, abra pelo ícone R10 Agenda e ative aqui." : "Este navegador não recebe notificações.");
    }
    if (!VAPID) return setPushMsg("Falta configurar as chaves de notificação (VAPID) no servidor.");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setPushMsg("Permissão negada. Libere as notificações do site nas configurações do celular.");
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/agenda" });
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveVapid(VAPID) });
    const { error } = await cli.rpc("salvar_push", { p_profissional: prof, p_sub: sub.toJSON() });
    if (error) return setPushMsg("Não foi possível salvar este celular. Tente de novo.");
    const nome = barbeiros.find((b) => b.id === prof)?.nome || quem?.nome || "";
    setPushMsg(`Pronto! Este celular vai avisar os novos agendamentos de ${nome}.`);
  }

  /* ---------- telas ---------- */
  if (sessao === undefined) return <main className="ag"><p className="ag__aviso">Carregando…</p></main>;
  if (!sessao) return <Entrar cli={cli} />;
  if (quem && !quem.admin && !quem.profissional) {
    return (
      <main className="ag">
        <Topo cli={cli} />
        <p className="ag__aviso">Sua conta (<strong>{sessao.user.email}</strong>) ainda não está liberada no painel. Peça para o dono da R10 ligar sua conta ao seu nome de barbeiro.</p>
      </main>
    );
  }

  const nomeDe = (id) => barbeiros.find((b) => b.id === id)?.nome || "";
  const ativos = itens.filter((i) => i.status === "agendado" || i.status === "concluido");
  const totalDia = ativos.reduce((s, i) => s + (i.total_centavos || 0), 0);
  const linhas = [
    ...itens.map((i) => ({ tipo: "ag", t: i.inicio, i })),
    ...bloqueios.map((b) => ({ tipo: "bl", t: b.inicio, b }))
  ].sort((x, y) => new Date(x.t) - new Date(y.t));

  // o dono usa o Painel Gestor para faturamento, serviços, equipe e configurações
  const menuDono = quem?.admin && !embutido && (
    <a className="ag__btn ag__btn--linha" href="/gestor" style={{ width: "100%", marginBottom: 14 }}>📊 Abrir o Painel Gestor (dono)</a>
  );

  async function confirmar(id) {
    const { error } = await cli.from("agendamentos").update({ confirmado_em: new Date().toISOString() }).eq("id", id);
    if (error) return setAviso("Só o dono confirma por aqui. Peça para ele, ou marque como concluído no atendimento.");
    carregar();
  }
  async function bloquearDia(prof) {
    if (!prof) return setAviso("Escolha o barbeiro no formulário abaixo para bloquear o dia.");
    if (!confirm(`Bloquear o dia ${dia.split("-").reverse().join("/")} inteiro de ${nomeDe(prof)}? O site para de oferecer horários nesse dia.`)) return;
    const { error } = await cli.from("bloqueios").insert({ profissional_id: prof, inicio: `${dia}T00:00:00-03:00`, fim: `${somaDias(dia, 1)}T00:00:00-03:00`, motivo: "Dia bloqueado (folga)" });
    if (error) return setAviso("Não foi possível bloquear o dia.");
    carregar();
  }

  return (
    <main className={embutido ? "ag ag--embutido" : "ag"}>
      {!embutido && <Topo cli={cli} aoVivo={aoVivo} />}
      {menuDono}

      {!embutido && <><div className="ag__push">
        {quem?.admin && (
          <select value={pushPara} onChange={(e) => setPushPara(e.target.value)} aria-label="Quem usa este celular">
            <option value="">Quem usa este celular?</option>
            {barbeiros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        )}
        <button className="ag__btn ag__btn--vinho" onClick={ativarPush}>🔔 Ativar notificações neste celular</button>
      </div>
      {pushMsg && <p className="ag__aviso">{pushMsg}</p>}
      {ios && !instalado && !pushMsg && (
        <p className="ag__aviso">No iPhone, as notificações só funcionam com o app instalado: toque em <strong>Compartilhar → Adicionar à Tela de Início</strong> e abra pelo ícone <strong>R10 Agenda</strong>.</p>
      )}</>}

      <nav className="ag__abas" aria-label="Barbeiros">
        {abas.map((a) => <button key={a.id} className="ag__aba" aria-pressed={aba === a.id} onClick={() => setAba(a.id)}>{a.nome}</button>)}
      </nav>

      <div className="ag__dia">
        <button aria-label="Dia anterior" onClick={() => setDia(somaDias(dia, -1))}>‹</button>
        <input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} aria-label="Dia" />
        <button aria-label="Próximo dia" onClick={() => setDia(somaDias(dia, 1))}>›</button>
        {dia !== hojeIso() && <button className="ag__hoje" onClick={() => setDia(hojeIso())}>Hoje</button>}
      </div>
      <p className="ag__resumo"><span style={{ textTransform: "capitalize" }}>{diaLongo(dia)}</span><span>{ativos.length} horário(s) · {reais(totalDia)}</span></p>
      {aviso && <p className="ag__aviso">{aviso}</p>}

      <section className="ag__lista" aria-busy={carregando}>
        {!carregando && !linhas.length && <div className="vazio"><strong>Agenda livre</strong>Nenhum horário marcado neste dia.</div>}
        {linhas.map((l) => l.tipo === "bl" ? (
          <div className="bloqueio" key={"b" + l.b.id}>
            <span><strong>{hora(l.b.inicio)}–{hora(l.b.fim)}</strong> · {l.b.motivo || "Bloqueado"}{aba === "todos" && l.b.profissional_id ? " · " + nomeDe(l.b.profissional_id) : ""}</span>
            {(quem?.admin || l.b.profissional_id === quem?.profissional) && <button className="ag__btn ag__btn--linha" onClick={() => desbloquear(l.b.id)}>Liberar</button>}
          </div>
        ) : (
          <article className={"cartao cartao--" + l.i.status} key={l.i.id}>
            <div className="cartao__hora">{hora(l.i.inicio)}<small>até {hora(l.i.fim)}</small></div>
            <p className="cartao__nome">{l.i.nome_cliente}</p>
            <p className="cartao__info">{(l.i.agendamento_servicos || []).map((s) => s.nome).join(", ") || "Serviço"}{aba === "todos" ? " · " + nomeDe(l.i.profissional_id) : ""}</p>
            <p className="cartao__valor">{reais(l.i.total_centavos)} {l.i.status !== "agendado" ? <span className={"selo selo--" + l.i.status}>{l.i.status === "concluido" ? "Concluído (pago)" : l.i.status === "falta" ? "Faltou" : "Cancelado"}</span>
              : l.i.confirmado_em ? <span className="selo selo--concluido">Confirmado</span> : null}</p>
            <div className="cartao__acoes">
              <a className="ag__btn ag__btn--ok" href={`https://wa.me/55${soDig(l.i.telefone_cliente)}?text=${encodeURIComponent(`Olá, ${String(l.i.nome_cliente).split(" ")[0]}! Aqui é da R10 Barbearia sobre o seu horário das ${hora(l.i.inicio)}.`)}`} target="_blank" rel="noopener">WhatsApp</a>
              {l.i.status === "agendado" && !l.i.confirmado_em && quem?.admin && <button className="ag__btn ag__btn--linha" onClick={() => confirmar(l.i.id)}>Confirmar</button>}
              {l.i.status === "agendado" && <button className="ag__btn" onClick={() => mudarStatus(l.i.id, "concluido")}>✓ Concluído (pago)</button>}
              {l.i.status === "agendado" && <button className="ag__btn ag__btn--linha" onClick={() => mudarStatus(l.i.id, "cancelado")}>Cancelar</button>}
              {l.i.status !== "agendado" && <button className="ag__btn ag__btn--linha" onClick={() => mudarStatus(l.i.id, "agendado")}>Desfazer</button>}
            </div>
          </article>
        ))}
      </section>

      <form className="ag__bloquear" onSubmit={bloquear}>
        <h2>Bloquear horário</h2>
        <div className="campos">
          {aba === "todos" && (
            <label className="campo campo--largo">Barbeiro
              <select name="prof" defaultValue=""><option value="" disabled>Escolha</option>{barbeiros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select>
            </label>
          )}
          <label className="campo">Das<input name="ini" type="time" step="1800" required /></label>
          <label className="campo">Até<input name="fim" type="time" step="1800" required /></label>
          <label className="campo campo--largo">Motivo<input name="motivo" placeholder="Almoço, folga, compromisso…" maxLength={60} /></label>
        </div>
        <div className="cartao__acoes" style={{ marginTop: 0 }}>
          <button className="ag__btn ag__btn--vinho" type="submit">Bloquear esse horário</button>
          <button type="button" className="ag__btn ag__btn--linha" onClick={(e) => bloquearDia(aba === "todos" ? e.currentTarget.form.prof?.value : aba)}>Bloquear o dia inteiro (folga)</button>
        </div>
      </form>
    </main>
  );
}

function Topo({ cli, aoVivo }) {
  return (
    <header className="ag__topo">
      <p className="ag__marca">R10 Agenda<small>Painel dos barbeiros {aoVivo && <span className="ao-vivo"><i />ao vivo</span>}</small></p>
      <button className="ag__sair" onClick={() => cli.auth.signOut()}>Sair</button>
    </header>
  );
}

function Entrar({ cli }) {
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function enviar(e) {
    e.preventDefault();
    const f = e.currentTarget;
    setErro(""); setOcupado(true);
    const { error } = await cli.auth.signInWithPassword({ email: f.email.value.trim().toLowerCase(), password: f.senha.value });
    setOcupado(false);
    if (error) setErro(/invalid login/i.test(error.message) ? "E-mail ou senha incorretos." : /not confirmed/i.test(error.message) ? "Confirme seu e-mail antes (código enviado ao criar a conta)." : "Não foi possível entrar agora.");
  }
  return (
    <main className="ag">
      <form className="login" onSubmit={enviar}>
        <h1>R10 Agenda</h1>
        <p>Entre com a sua conta de barbeiro.</p>
        <label className="campo">E-mail<input name="email" type="email" autoComplete="email" required /></label>
        <label className="campo">Senha<input name="senha" type="password" autoComplete="current-password" required /></label>
        {erro && <p className="erro">{erro}</p>}
        <button className="ag__btn ag__btn--vinho" type="submit" disabled={ocupado}>{ocupado ? "Entrando…" : "Entrar"}</button>
      </form>
    </main>
  );
}
