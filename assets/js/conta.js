// =====================================================================
// R10 — painel "Sua conta" dentro do próprio site (index.html)
// Endereços: #conta · #conta/agendamentos · #conta/plano · #conta/clube
// O "voltar" do celular fecha o painel (cada abertura vira um passo no histórico;
// trocar de aba só substitui o endereço, então um "voltar" já fecha).
// =====================================================================
import { configurado, sb, mensagemErro } from "./supabase.js";
import { esc, reais, toast, modal, linkIcs, icone, esqueleto, vazio } from "./ui.js";
import { carregarPlanos, assinaturaAtiva, proximosAgendamentos, agendamentosAnteriores, cartaoAgendamento } from "./dados.js";

const ABAS = [
  { id: "",             nome: "Minha conta",  curto: "Conta",        icone: icone.perfil },
  { id: "agendamentos", nome: "Agendamentos", curto: "Agendamentos", icone: icone.agenda },
  { id: "plano",        nome: "Meu plano",    curto: "Meu plano",    icone: icone.plano },
  { id: "clube",        nome: "Clube",        curto: "Clube",        icone: icone.clube }
];

const dlg = document.getElementById("painel-conta");
const corpo = dlg.querySelector("[data-c=corpo]");
const tituloEl = dlg.querySelector("[data-c=titulo]");
const abasEl = dlg.querySelector("[data-c=abas]");
const fotoEl = dlg.querySelector("[data-c=foto]");
const ctx = { cliente: null, usuario: null, perfil: null, configurado };
const reduzido = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

abasEl.innerHTML = ABAS.map((a) =>
  `<a class="conta__aba" role="tab" href="#conta${a.id ? "/" + a.id : ""}" data-aba="${a.id}">${a.icone}<span>${esc(a.curto)}</span></a>`).join("");

/* ---------------- endereço ↔ painel ---------------- */
function abaDoEndereco() {
  const m = /^#conta(?:\/([a-z]+))?\/?$/.exec(location.hash);
  if (!m) return null;
  return ABAS.find((a) => a.id === (m[1] || "")) || ABAS[0];
}

let aberto = false, temVolta = false, versao = 0, pronto = null;

function abrirPainel(aba, viaNavegacao) {
  if (!aberto) {
    aberto = true; temVolta = viaNavegacao;
    document.documentElement.classList.add("conta-aberta");
    dlg.classList.remove("saindo");
    if (!dlg.open) dlg.showModal();
  }
  mostrar(aba);
}
function fecharPainel() {
  if (!aberto) return;
  aberto = false;
  if (pedido) { const p = pedido; pedido = null; p.resolver(ctx.usuario); }   // fechou sem entrar
  pendente = null;
  const fim = () => {
    if (aberto) return;                               // reaberto no meio da animação
    dlg.classList.remove("saindo");
    if (dlg.open) dlg.close();
    document.documentElement.classList.remove("conta-aberta");
  };
  if (reduzido()) return fim();
  dlg.classList.add("saindo");
  dlg.addEventListener("animationend", fim, { once: true });
  setTimeout(fim, 400);
}
// X, Esc ou toque fora: volta no histórico se o painel foi aberto por um link; senão só limpa o endereço
function pedirFechar() {
  if (temVolta) history.back();
  else { history.replaceState(null, "", location.pathname + location.search); fecharPainel(); }
}

addEventListener("hashchange", () => {
  const aba = abaDoEndereco();
  if (aba) abrirPainel(aba, true); else fecharPainel();
});
dlg.addEventListener("cancel", (e) => { e.preventDefault(); pedirFechar(); });
dlg.addEventListener("click", (e) => {
  // só o X fecha (tocar na parte escura de fora não fecha, para não perder o que foi digitado)
  if (e.target.closest("[data-conta-fechar]")) return pedirFechar();
  if (e.target === dlg) return;
  const aba = e.target.closest("[data-aba]");
  if (aba) {
    e.preventDefault();
    history.replaceState(null, "", aba.getAttribute("href"));
    return mostrar(ABAS.find((a) => a.id === aba.dataset.aba) || ABAS[0]);
  }
  // link para uma parte do site (#agendar…): fecha o painel e vai até lá
  const link = e.target.closest('a[href^="#"]');
  if (link && !/^#conta/.test(link.getAttribute("href"))) {
    const href = link.getAttribute("href"), alvo = href.length > 1 && href.indexOf("=") < 0 ? document.querySelector(href) : null;
    if (!alvo) return;
    e.preventDefault(); e.stopPropagation();
    history.replaceState(null, "", href);
    fecharPainel();
    setTimeout(() => window.r10Viajar ? window.r10Viajar(alvo) : alvo.scrollIntoView(), reduzido() ? 0 : 240);
  }
});

/* ---------------- sessão ---------------- */
let pedido = null;        // login pedido por outra parte do site (agendamento, plano): { texto, resolver }
let pendente = null;      // código enviado por e-mail aguardando: { email, tipo: 'email' | 'signup' | 'recovery' }
let modoEntrar = "senha"; // senha | codigo | criar | esqueci
let ocupado = false;      // durante um fluxo de login, não redesenhar no meio
const ouvintes = [];

function preparar() {
  if (!pronto) pronto = (async () => {
    if (!configurado) return;
    ctx.cliente = await sb();
    const { data } = await ctx.cliente.auth.getSession();
    ctx.usuario = data.session?.user || null;
    if (ctx.usuario) await carregarPerfil();
    ctx.cliente.auth.onAuthStateChange((evento, sessao) => {
      const antes = ctx.usuario?.id, agora = sessao?.user?.id;
      ctx.usuario = sessao?.user || null;
      if (antes === agora && evento !== "USER_UPDATED") return;   // só renovou o token
      setTimeout(async () => {                                      // fora do callback (recomendação do Supabase)
        if (ctx.usuario) await carregarPerfil(); else { ctx.perfil = null; ctx.fotoUrl = null; }
        pintarFoto(); pintarMenu();
        ouvintes.forEach((fn) => { try { fn(ctx.usuario, ctx.perfil); } catch {} });
        if (!ocupado) aposEntrar();
      }, 0);
    });
  })();
  return pronto;
}
// depois de entrar: se outra parte do site pediu o login, volta para ela; senão mostra a conta
function aposEntrar() {
  if (ctx.usuario && pedido) { const p = pedido; pedido = null; p.resolver(ctx.usuario); pedirFechar(); return; }
  if (aberto) mostrar(abaDoEndereco() || ABAS[0]);
}

async function carregarPerfil() {
  const { data } = await ctx.cliente.from("perfis").select("*").eq("id", ctx.usuario.id).maybeSingle();
  ctx.perfil = data || { nome: ctx.usuario.user_metadata?.nome || "" };
  ctx.fotoUrl = null;
  if (data?.foto_path) {
    const { data: u } = await ctx.cliente.storage.from("fotos").createSignedUrl(data.foto_path, 60 * 60 * 6);
    ctx.fotoUrl = u?.signedUrl || null;
  }
}

const iniciais = (nome) => esc((nome || "").trim().split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase());
function avatarHtml(tamanho) {
  if (ctx.fotoUrl) return `<img src="${esc(ctx.fotoUrl)}" alt="">`;
  const ini = iniciais(ctx.perfil?.nome);
  return ini || icone.perfil.replace("<svg", `<svg width="${tamanho}" height="${tamanho}"`);
}
function pintarFoto() { fotoEl.innerHTML = avatarHtml(26); }

// menu do site: mostra quem está logado (foto + nome) acima do botão
function pintarMenu() {
  const botao = document.querySelector(".menu__entrar");
  if (!botao) return;
  let quem = document.querySelector(".menu__quem");
  if (ctx.usuario) {
    if (!quem) { quem = document.createElement("a"); quem.className = "menu__quem"; quem.href = "#conta"; botao.before(quem); }
    const nome = (ctx.perfil?.nome || "").split(" ")[0];
    quem.innerHTML = `<span class="conta__foto">${avatarHtml(20)}</span><span><strong>${nome ? "Olá, " + esc(nome) : "Olá!"}</strong><small>${esc(ctx.usuario.email)}</small></span>`;
    botao.firstChild.nodeValue = "Minha conta ";
  } else {
    quem?.remove();
    botao.firstChild.nodeValue = "Entrar / Criar conta ";
  }
}

/* ---------------- telas ---------------- */
const AVISO_PREVIA = `<div class="c-aviso"><span aria-hidden="true">⚙</span><span><strong>Prévia.</strong> O login e os seus dados entram quando o banco (Supabase) for conectado. Por enquanto as telas mostram como vai ficar.</span></div>`;

async function mostrar(aba) {
  const v = ++versao;
  abasEl.querySelectorAll("[data-aba]").forEach((a) => {
    if (a.dataset.aba === aba.id) { a.setAttribute("aria-current", "page"); a.scrollIntoView({ block: "nearest", inline: "nearest" }); }
    else a.removeAttribute("aria-current");
  });
  const tela = document.createElement("div");
  tela.className = "conta__tela";
  tela.innerHTML = esqueleto(2);
  corpo.replaceChildren(tela);
  corpo.scrollTop = 0;
  await preparar();
  if (v !== versao) return;
  pintarFoto();
  tela.innerHTML = configurado ? "" : AVISO_PREVIA;
  const logado = !configurado || ctx.usuario;
  tituloEl.textContent = logado ? aba.nome : (modoEntrar === "criar" ? "Criar conta" : "Entrar");
  abasEl.hidden = !logado;
  if (!logado) return telaEntrar(tela);
  await TELAS[aba.id || "conta"](tela);
  if (aberto) corpo.focus({ preventScroll: true });
}

/* ---------------- entrar / criar conta / esqueci a senha ---------------- */
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
function traduzir(erro) {
  const m = String(erro?.message || erro || "");
  if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(m)) return "confirmar";
  if (/already registered|already been registered|user_already_exists/i.test(m)) return "Este e-mail já tem conta. Entre com sua senha ou receba um código.";
  if (/signups not allowed|user not found/i.test(m)) return "Não encontramos uma conta com este e-mail. Crie sua conta.";
  if (/expired|invalid.*(otp|token)|token.*invalid/i.test(m)) return "Código errado ou vencido. Confira os 6 dígitos ou peça outro.";
  if (/only request this after|rate limit|too many/i.test(m)) return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
  if (/password.*(at least|characters)|weak/i.test(m)) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/same.*password|different from the old/i.test(m)) return "A nova senha precisa ser diferente da anterior.";
  if (/sending.*(email|e-mail)|smtp|mail.*(fail|error)/i.test(m)) return "Não conseguimos enviar o e-mail com o código agora. Tente de novo em alguns minutos.";
  if (/fetch|network/i.test(m)) return "Sem conexão agora. Confira sua internet e tente de novo.";
  return "Não foi possível agora. Tente de novo em instantes.";
}

function telaEntrar(el) {
  const intro = pedido?.texto ? `<div class="c-aviso"><span aria-hidden="true">✂</span><span>${esc(pedido.texto)}</span></div>` : "";
  let html = intro;
  if (pendente) {
    const textos = { email: "entrar", signup: "confirmar seu e-mail e criar a conta", recovery: "criar uma nova senha" };
    html += `<form class="c-form" data-f="codigo" novalidate>
      <p class="c-texto" style="margin-bottom:18px">Enviamos um código de 6 dígitos para <strong>${esc(pendente.email)}</strong>. Digite abaixo para ${textos[pendente.tipo]}. Ele vale por 15 minutos (confira também o spam).</p>
      <div class="campos">
        <label class="campo"><span>Código</span><input name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" class="c-otp"></label>
        ${pendente.tipo === "recovery" ? `<label class="campo"><span>Nova senha</span><input name="senha" type="password" autocomplete="new-password" minlength="8" placeholder="Pelo menos 8 caracteres"></label>` : ""}
      </div>
      <p class="campo__erro" role="alert" data-erro style="margin-top:12px"></p>
      <button class="botao" type="submit">${pendente.tipo === "recovery" ? "Salvar nova senha" : "Confirmar código"} ${icone.seta}</button>
      <div class="c-acoes"><button type="button" class="c-link" data-reenviar>Reenviar código</button><button type="button" class="c-link c-link--fraco" data-trocar>Trocar e-mail</button></div>
    </form>`;
  } else if (modoEntrar === "criar") {
    html += `<form class="c-form" data-f="criar" novalidate>
      <div class="campos">
        <label class="campo"><span>Nome</span><input name="nome" autocomplete="name" maxlength="80"></label>
        <label class="campo c3"><span>E-mail</span><input name="email" type="email" inputmode="email" autocomplete="email" maxlength="120"></label>
        <label class="campo c3"><span>Telefone (WhatsApp)</span><input name="telefone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(43) 99999-9999"></label>
        <label class="campo"><span>Senha</span><input name="senha" type="password" autocomplete="new-password" minlength="8" placeholder="Pelo menos 8 caracteres"></label>
      </div>
      <p class="campo__erro" role="alert" data-erro style="margin-top:12px"></p>
      <button class="botao" type="submit">Criar conta ${icone.seta}</button>
      <div class="c-acoes"><span class="c-suave">Já tem conta?</span><button type="button" class="c-link" data-modo="senha">Entrar</button></div>
    </form>`;
  } else if (modoEntrar === "esqueci") {
    html += `<form class="c-form" data-f="esqueci" novalidate>
      <p class="c-texto" style="margin-bottom:18px">Digite o e-mail da sua conta. Enviamos um código para você criar uma nova senha.</p>
      <div class="campos"><label class="campo"><span>E-mail</span><input name="email" type="email" inputmode="email" autocomplete="email" maxlength="120"></label></div>
      <p class="campo__erro" role="alert" data-erro style="margin-top:12px"></p>
      <button class="botao" type="submit">Enviar código ${icone.seta}</button>
      <div class="c-acoes"><button type="button" class="c-link" data-modo="senha">Voltar para entrar</button></div>
    </form>`;
  } else {
    const comCodigo = modoEntrar === "codigo";
    html += `<form class="c-form" data-f="${comCodigo ? "pedir-codigo" : "senha"}" novalidate>
      <div class="campos">
        <label class="campo"><span>E-mail</span><input name="email" type="email" inputmode="email" autocomplete="email" maxlength="120"></label>
        ${comCodigo ? "" : `<label class="campo"><span>Senha</span><input name="senha" type="password" autocomplete="current-password"></label>`}
      </div>
      ${comCodigo ? `<p class="campo__ajuda" style="margin-top:10px">Sem senha: enviamos um código de 6 dígitos para o seu e-mail.</p>` : ""}
      <p class="campo__erro" role="alert" data-erro style="margin-top:12px"></p>
      <button class="botao" type="submit">${comCodigo ? "Receber código" : "Entrar"} ${icone.seta}</button>
      <div class="c-acoes">
        ${comCodigo ? `<button type="button" class="c-link" data-modo="senha">Entrar com senha</button>` : `<button type="button" class="c-link" data-modo="esqueci">Esqueci minha senha</button>`}
      </div>
    </form>
    <div class="c-cartao" style="margin-top:28px"><p class="c-secao__titulo">Ainda não tem conta?</p>
      <button style="margin-top:18px" type="button" class="botao botao--linha" data-modo="criar">Criar conta ${icone.seta}</button></div>`;
  }
  el.insertAdjacentHTML("beforeend", html);

  const f = el.querySelector("form");
  const erro = el.querySelector("[data-erro]");
  const falhar = (m) => { erro.textContent = m; ocupado = false; botao && (botao.disabled = false); };
  const botao = f.querySelector("[type=submit]");
  const lembrado = sessionStorage.getItem("r10_email") || "";
  if (f.elements.email && !f.elements.email.value) f.elements.email.value = lembrado;
  if (f.elements.telefone) f.elements.telefone.addEventListener("input", (e) => { e.target.value = mascaras.telefone(e.target.value); });
  if (f.elements.codigo) f.elements.codigo.addEventListener("input", (e) => { e.target.value = so(e.target.value).slice(0, 6); });
  setTimeout(() => (f.elements.codigo || f.elements.nome || f.elements.email)?.focus({ preventScroll: true }), 60);

  el.addEventListener("click", (e) => {
    const modo = e.target.closest("[data-modo]");
    if (modo) { modoEntrar = modo.dataset.modo; pendente = null; return mostrar(abaDoEndereco() || ABAS[0]); }
    if (e.target.closest("[data-trocar]")) { pendente = null; return mostrar(abaDoEndereco() || ABAS[0]); }
    if (e.target.closest("[data-reenviar]")) return enviarDeNovo();
  });

  async function enviarDeNovo() {
    erro.textContent = "";
    const c = ctx.cliente, p = pendente;
    const { error } = p.tipo === "signup" ? await c.auth.resend({ type: "signup", email: p.email })
      : p.tipo === "recovery" ? await c.auth.resetPasswordForEmail(p.email)
      : await c.auth.signInWithOtp({ email: p.email, options: { shouldCreateUser: false } });
    if (error) return falhar(traduzir(error));
    toast("Enviamos um novo código.");
  }
  function irParaCodigo(email, tipo) {
    sessionStorage.setItem("r10_email", email);
    pendente = { email, tipo }; ocupado = false;
    mostrar(abaDoEndereco() || ABAS[0]);
  }

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    erro.textContent = "";
    const c = ctx.cliente, tipoForm = f.dataset.f;
    const email = (f.elements.email?.value || pendente?.email || "").trim().toLowerCase();
    if (tipoForm !== "codigo" && !EMAIL_OK.test(email)) { f.elements.email.focus(); return falhar("Digite um e-mail válido."); }
    botao.disabled = true; ocupado = true;

    if (tipoForm === "senha") {
      const senha = f.elements.senha.value;
      if (!senha) { botao.disabled = false; ocupado = false; f.elements.senha.focus(); return falhar("Digite sua senha."); }
      sessionStorage.setItem("r10_email", email);
      const { error } = await c.auth.signInWithPassword({ email, password: senha });
      if (!error) { ocupado = false; return; }                      // onAuthStateChange cuida do resto
      if (traduzir(error) === "confirmar") {                        // conta criada mas e-mail ainda não confirmado
        await c.auth.resend({ type: "signup", email });
        return irParaCodigo(email, "signup");
      }
      return falhar(traduzir(error));
    }
    if (tipoForm === "pedir-codigo") {
      const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      return error ? falhar(traduzir(error)) : irParaCodigo(email, "email");
    }
    if (tipoForm === "esqueci") {
      const { error } = await c.auth.resetPasswordForEmail(email);
      return error ? falhar(traduzir(error)) : irParaCodigo(email, "recovery");
    }
    if (tipoForm === "criar") {
      const nome = f.elements.nome.value.trim(), tel = so(f.elements.telefone.value), senha = f.elements.senha.value;
      if (nome.length < 2) { f.elements.nome.focus(); return falhar("Digite seu nome."); }
      if (!/^\d{10,11}$/.test(tel)) { f.elements.telefone.focus(); return falhar("Digite seu telefone com DDD."); }
      if (senha.length < 8) { f.elements.senha.focus(); return falhar("A senha precisa ter pelo menos 8 caracteres."); }
      const { data, error } = await c.auth.signUp({ email, password: senha, options: { data: { nome, telefone: tel } } });
      if (error) return falhar(traduzir(error));
      if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length)
        return falhar("Este e-mail já tem conta. Entre com sua senha ou receba um código.");
      if (data.session) { ocupado = false; return; }                // confirmação de e-mail desligada: já entrou
      return irParaCodigo(email, "signup");
    }
    if (tipoForm === "codigo") {
      const codigo = so(f.elements.codigo.value);
      if (codigo.length !== 6) { botao.disabled = false; ocupado = false; f.elements.codigo.focus(); return falhar("Digite os 6 dígitos do código."); }
      if (pendente.tipo === "recovery" && f.elements.senha.value.length < 8) { botao.disabled = false; ocupado = false; f.elements.senha.focus(); return falhar("A nova senha precisa ter pelo menos 8 caracteres."); }
      const { error } = await c.auth.verifyOtp({ email: pendente.email, token: codigo, type: pendente.tipo });
      if (error) return falhar(traduzir(error));
      if (pendente.tipo === "recovery") {
        const { error: e2 } = await c.auth.updateUser({ password: f.elements.senha.value });
        if (e2) return falhar(traduzir(e2));
        toast("Senha nova salva.");
      }
      pendente = null; ocupado = false; modoEntrar = "senha";
      aposEntrar();
    }
  });
}

/* ----- Conta (perfil) ----- */
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const so = (v) => String(v || "").replace(/\D/g, "");
function cpfValido(c) {
  c = so(c);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0; for (let i = 0; i < t; i++) s += +c[i] * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== +c[t]) return false;
  }
  return true;
}
const mascaras = {
  telefone: (v) => { const d = so(v).slice(0, 11); return d.length > 7 ? `(${d.slice(0,2)}) ${d.slice(2, d.length-4)}-${d.slice(-4)}` : d.length > 2 ? `(${d.slice(0,2)}) ${d.slice(2)}` : d; },
  cpf: (v) => so(v).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"),
  cep: (v) => so(v).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2")
};

async function telaConta(el) {
  el.insertAdjacentHTML("beforeend", `
    <div class="c-foto"><span class="conta__foto" data-foto-grande></span>
      <div><p style="font-weight:800">Foto do perfil</p>
      <label class="c-link" style="display:inline-block;margin-top:6px">Trocar foto<input type="file" accept="image/*" hidden data-foto-arquivo></label></div></div>
    <form class="c-form" novalidate>
      <div class="campos">
        <label class="campo"><span>Nome</span><input name="nome" autocomplete="name" maxlength="80"></label>
        <label class="campo c3"><span>E-mail</span><input name="email" type="email" value="${esc(ctx.usuario?.email || "")}" readonly></label>
        <label class="campo c3"><span>Telefone</span><input name="telefone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(43) 99999-9999"></label>
        <label class="campo c3"><span>Data de nascimento</span><input name="nascimento" type="date" autocomplete="bday"></label>
        <label class="campo c3"><span>CPF</span><input name="cpf" inputmode="numeric" placeholder="000.000.000-00"><small class="campo__erro" data-erro="cpf"></small></label>
        <label class="campo c2"><span>CEP</span><input name="cep" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000"><small class="campo__ajuda" data-cep></small></label>
        <label class="campo c4"><span>Rua</span><input name="rua" autocomplete="address-line1" maxlength="120"></label>
        <label class="campo c2 c-meia"><span>Número</span><input name="numero" maxlength="10"></label>
        <label class="campo c4 c-meia"><span>Complemento</span><input name="complemento" maxlength="60"></label>
        <label class="campo c2"><span>Bairro</span><input name="bairro" maxlength="60"></label>
        <label class="campo c2 c-meia"><span>Cidade</span><input name="cidade" autocomplete="address-level2" maxlength="60"></label>
        <label class="campo c2 c-meia"><span>Estado</span><select name="uf"><option value="">—</option>${UFS.map((u) => `<option>${u}</option>`).join("")}</select></label>
      </div>
      <button class="botao" type="submit">Salvar alterações ${icone.seta}</button>
    </form>
    ${ctx.usuario ? `<div class="c-acoes"><button type="button" class="c-link c-link--fraco" data-sair>Sair da conta</button></div>` : ""}`);

  el.querySelector("[data-foto-grande]").innerHTML = avatarHtml(36);
  const f = el.querySelector("form");

  if (ctx.cliente && ctx.usuario) {
    const { data } = await ctx.cliente.from("perfis").select("*").eq("id", ctx.usuario.id).single();
    if (data) {
      ctx.perfil = data; pintarFoto();
      ["nome","nascimento","rua","numero","complemento","cidade","bairro","uf"].forEach((k) => { if (data[k]) f.elements[k].value = data[k]; });
      if (data.cpf) f.elements.cpf.value = mascaras.cpf(data.cpf);
      if (data.cep) f.elements.cep.value = mascaras.cep(data.cep);
      if (data.telefone) f.elements.telefone.value = mascaras.telefone(data.telefone);
    }
  }

  ["telefone","cpf","cep"].forEach((k) => f.elements[k].addEventListener("input", (e) => { e.target.value = mascaras[k](e.target.value); }));

  // CEP → endereço (ViaCEP)
  const ajudaCep = el.querySelector("[data-cep]");
  f.elements.cep.addEventListener("input", async () => {
    const cep = so(f.elements.cep.value);
    if (cep.length !== 8) { ajudaCep.textContent = ""; return; }
    ajudaCep.textContent = "Buscando endereço…";
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json());
      if (r.erro) { ajudaCep.textContent = "CEP não encontrado."; return; }
      f.elements.rua.value = r.logradouro || ""; f.elements.bairro.value = r.bairro || "";
      f.elements.cidade.value = r.localidade || ""; f.elements.uf.value = r.uf || "";
      ajudaCep.textContent = ""; f.elements.numero.focus();
    } catch { ajudaCep.textContent = "Não foi possível buscar o CEP. Preencha à mão."; }
  });

  // foto: recorta em quadrado, reduz para 400 px no próprio aparelho e guarda na pasta privada da pessoa
  el.querySelector("[data-foto-arquivo]").addEventListener("change", async (e) => {
    const arq = e.target.files?.[0];
    e.target.value = "";
    if (!arq) return;
    if (!ctx.cliente) return toast("Prévia: a foto passa a ser salva quando o banco for conectado.", "erro");
    if (!/^image\//.test(arq.type)) return toast("Escolha uma imagem (JPG ou PNG).", "erro");
    if (arq.size > 15 * 1024 * 1024) return toast("Essa imagem é grande demais. Escolha outra.", "erro");
    const grande = el.querySelector("[data-foto-grande]");
    grande.style.opacity = ".5";
    try {
      const img = await createImageBitmap(arq);
      const lado = Math.min(img.width, img.height), tam = 400;
      const tela = document.createElement("canvas"); tela.width = tela.height = tam;
      tela.getContext("2d").drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, tam, tam);
      const blob = await new Promise((r) => tela.toBlob(r, "image/jpeg", 0.85));
      const caminho = `${ctx.usuario.id}/foto-${Date.now()}.jpg`;
      const { error: e1 } = await ctx.cliente.storage.from("fotos").upload(caminho, blob, { contentType: "image/jpeg", upsert: false });
      if (e1) throw e1;
      const antiga = ctx.perfil?.foto_path;
      const { error: e2 } = await ctx.cliente.from("perfis").update({ foto_path: caminho }).eq("id", ctx.usuario.id);
      if (e2) throw e2;
      if (antiga) ctx.cliente.storage.from("fotos").remove([antiga]);
      await carregarPerfil();
      pintarFoto(); pintarMenu();
      grande.innerHTML = avatarHtml(36);
      toast("Foto atualizada.");
    } catch {
      toast("Não foi possível trocar a foto. Tente outra imagem.", "erro");
    } finally { grande.style.opacity = ""; }
  });

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const erroCpf = el.querySelector("[data-erro=cpf]");
    erroCpf.textContent = "";
    const cpf = so(f.elements.cpf.value);
    if (cpf && !cpfValido(cpf)) { erroCpf.textContent = "CPF inválido."; f.elements.cpf.focus(); return; }
    const telDig = so(f.elements.telefone.value);
    if (telDig && !/^\d{10,11}$/.test(telDig)) { f.elements.telefone.focus(); return toast("Digite o telefone com DDD.", "erro"); }
    const cepDig = so(f.elements.cep.value);
    if (cepDig && cepDig.length !== 8) { f.elements.cep.focus(); return toast("O CEP tem 8 números.", "erro"); }
    if (!ctx.cliente) return toast("Prévia: o banco ainda não está conectado.", "erro");
    const dados = {
      nome: f.elements.nome.value.trim() || null, telefone: so(f.elements.telefone.value) || null,
      nascimento: f.elements.nascimento.value || null, cpf: cpf || null, cep: so(f.elements.cep.value) || null,
      rua: f.elements.rua.value.trim() || null, numero: f.elements.numero.value.trim() || null,
      complemento: f.elements.complemento.value.trim() || null, cidade: f.elements.cidade.value.trim() || null,
      bairro: f.elements.bairro.value.trim() || null, uf: f.elements.uf.value || null
    };
    const b = f.querySelector("[type=submit]"); b.disabled = true;
    const { error } = await ctx.cliente.from("perfis").update(dados).eq("id", ctx.usuario.id);
    b.disabled = false;
    if (error) return toast("Não foi possível salvar. Confira os dados.", "erro");
    ctx.perfil = Object.assign(ctx.perfil || {}, dados); pintarFoto(); pintarMenu();
    ouvintes.forEach((fn) => { try { fn(ctx.usuario, ctx.perfil); } catch {} });
    toast("Alterações salvas.");
  });

  el.querySelector("[data-sair]")?.addEventListener("click", async () => {
    await ctx.cliente.auth.signOut();
    ctx.perfil = null;
    toast("Você saiu da sua conta.");
  });
}

/* ----- Agendamentos ----- */
async function telaAgendamentos(el) {
  el.insertAdjacentHTML("beforeend", `
    <div class="c-seg" role="tablist" aria-label="Agendamentos">
      <button type="button" role="tab" data-lista="proximos" aria-selected="true">Próximos</button>
      <button type="button" role="tab" data-lista="anteriores" aria-selected="false">Anteriores</button>
    </div>
    <div class="c-lista" data-itens role="tabpanel"></div>`);
  const lista = el.querySelector("[data-itens]");
  const NOVO = `<a class="botao" href="#agendar">Agendar horário ${icone.seta}</a>`;
  const pagamento = (a) => a.pagamento_status === "pago" ? `<span class="c-selo c-selo--ok">Pago</span>`
    : a.pagamento_status === "reembolsado" ? `<span class="c-selo c-selo--off">Reembolsado</span>`
    : a.pagamento_status === "pendente" ? `<span class="c-selo c-selo--alerta">Aguardando pagamento</span>`
    : `<span class="c-selo">Pagar na barbearia</span>`;

  async function pintar(qual) {
    el.querySelectorAll("[data-lista]").forEach((b) => b.setAttribute("aria-selected", b.dataset.lista === qual));
    lista.innerHTML = esqueleto(2);
    try {
      if (qual === "proximos") {
        const itens = await proximosAgendamentos(ctx);
        lista.innerHTML = itens.length
          ? itens.map((a) => cartaoAgendamento(a, pagamento(a) +
              `<a class="c-link" href="${linkIcs({
                titulo: "R10 Barbearia — " + (a.agendamento_servicos || []).map((s) => s.nome).join(", "),
                inicio: a.inicio, fim: a.fim,
                local: "R10 Barbearia " + (a.unidades?.nome || "") + " — " + (a.unidades?.endereco || ""),
                descricao: "Barbeiro: " + (a.profissionais?.nome || "")
              })}" download="r10-barbearia.ics">Adicionar ao calendário</a>
              <button type="button" class="c-link c-link--fraco" data-cancelar="${esc(a.id)}">Cancelar</button>`)).join("")
          : vazio("Nenhum horário marcado", "Quando você agendar, seus próximos horários aparecem aqui.", NOVO);
      } else {
        const itens = await agendamentosAnteriores(ctx);
        lista.innerHTML = itens.length
          ? itens.map((a) => cartaoAgendamento(a, pagamento(a))).join("")
          : vazio("Nenhum atendimento ainda", "Seu histórico de atendimentos aparece aqui.");
      }
    } catch {
      lista.innerHTML = vazio("Não foi possível carregar", "Confira sua conexão e tente de novo.");
    }
  }

  el.addEventListener("click", async (e) => {
    const aba = e.target.closest("[data-lista]");
    if (aba) return pintar(aba.dataset.lista);
    const b = e.target.closest("[data-cancelar]");
    if (!b) return;
    const ok = await modal({
      titulo: "Cancelar horário?",
      texto: "O horário será liberado para outra pessoa.",
      acoes: [{ rotulo: "Sim, cancelar", valor: true }, { rotulo: "Manter meu horário", tipo: "link", valor: false }]
    });
    if (!ok) return;
    const { error } = await ctx.cliente.rpc("cancelar_agendamento", { p_id: b.dataset.cancelar });
    if (error) return toast(mensagemErro(error), "erro");
    toast("Horário cancelado.");
    pintar("proximos");
  });

  pintar("proximos");
}

/* ----- Meu plano ----- */
async function telaPlano(el) {
  const caixa = document.createElement("div");
  caixa.innerHTML = esqueleto(2);
  el.appendChild(caixa);
  const [assinatura, planos] = await Promise.all([assinaturaAtiva(ctx), carregarPlanos(ctx)]);

  if (assinatura) {
    caixa.innerHTML = `<div class="c-cartao">
      <p class="rotulo c-suave">Seu plano</p>
      <p class="c-plano__nome" style="margin-top:10px">${esc(assinatura.planos?.nome || "")}</p>
      <p style="margin-top:10px"><span class="c-selo c-selo--ok">Ativo</span></p>
      <div class="c-dados">
        <p class="c-dado"><span>Valor</span><b>${assinatura.planos ? reais(assinatura.planos.preco_centavos) : "—"}</b></p>
        <p class="c-dado"><span>Vence em</span><b>${assinatura.fim ? new Date(assinatura.fim).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</b></p>
      </div></div>`;
    return;
  }
  caixa.innerHTML = `
    <p class="c-texto" style="margin-bottom:18px">Você ainda não tem um plano. Escolha o seu e aproveite os benefícios do clube.</p>
    <div class="c-planos">${planos.map((p) => {
      const inteiro = Math.floor(p.preco_centavos / 100), cent = String(p.preco_centavos % 100).padStart(2, "0");
      return `<article class="c-plano">
        <p class="c-plano__nome">${esc(p.nome)}</p>
        <p class="c-plano__preco">R$ ${inteiro},${cent} <small>por mês</small></p>
        <button type="button" class="c-link" data-plano-ver="${esc(p.id)}" style="align-self:flex-start">Confira as vantagens</button>
        <button type="button" class="botao" data-plano-contratar="${esc(p.id)}">Contratar ${icone.seta}</button>
      </article>`;
    }).join("")}</div>`;
  caixa.addEventListener("click", (e) => {
    const ver = e.target.closest("[data-plano-ver]"), contratar = e.target.closest("[data-plano-contratar]");
    if (!window.r10AbrirPlano) return;
    if (ver) window.r10AbrirPlano(ver.dataset.planoVer, false);
    if (contratar) window.r10AbrirPlano(contratar.dataset.planoContratar, true);
  });
}

/* ----- Clube (cupons do sorteio) ----- */
async function telaClube(el) {
  el.insertAdjacentHTML("beforeend", `
    <section class="c-secao">
      <p class="c-texto" style="margin-bottom:18px">Ganhou um sorteio no Instagram da R10? Digite o código para resgatar o seu prêmio.</p>
      <form class="c-codigo" novalidate>
        <input name="codigo" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="24" placeholder="Seu código" aria-label="Código do cupom">
        <button class="botao" type="submit">Resgatar ${icone.seta}</button>
      </form>
      <p class="campo__erro" role="alert" data-erro style="margin-top:10px"></p>
    </section>
    <section class="c-secao">
      <div class="c-secao__cab"><h3 class="c-secao__titulo">Seus prêmios</h3></div>
      <div class="c-lista" data-premios>${esqueleto(1)}</div>
    </section>`);
  const f = el.querySelector("form"), erro = el.querySelector("[data-erro]"), premios = el.querySelector("[data-premios]");
  const data = (ts) => new Date(ts).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const ERROS = {
    invalido: "Código inválido. Confira as letras e os números.",
    usado: "Este código já foi resgatado por outra pessoa.",
    seu: "Você já resgatou este código. Ele está na sua lista.",
    vencido: "Este código venceu: o prazo para resgatar já passou.",
    tentativas: "Muitas tentativas seguidas. Tente de novo daqui a uma hora.",
    login: "Entre na sua conta para resgatar."
  };

  async function listar() {
    if (!ctx.cliente) { premios.innerHTML = vazio("Nenhum prêmio ainda", "Os prêmios que você resgatar aparecem aqui."); return; }
    const { data: lista, error } = await ctx.cliente.from("cupons")
      .select("id, codigo, premio, tipo, resgatado_em, expira_em, usado_em")
      .eq("resgatado_por", ctx.usuario.id).order("resgatado_em", { ascending: false });
    if (error) { premios.innerHTML = vazio("Não foi possível carregar", "Confira sua conexão e tente de novo."); return; }
    if (!lista.length) { premios.innerHTML = vazio("Nenhum prêmio ainda", "Os prêmios que você resgatar aparecem aqui, com o dia do resgate e quando vencem."); return; }
    const agora = Date.now();
    premios.innerHTML = lista.map((c) => {
      const vencido = new Date(c.expira_em).getTime() < agora;
      // plano: "usado" na hora do resgate, mas fica valendo (verde) até vencer
      const disponivel = c.tipo === "plano" ? !vencido : (!c.usado_em && !vencido);
      const situacao = c.tipo === "plano"
        ? (disponivel ? "Plano ativo" : "Plano encerrado")
        : (c.usado_em ? "Usado" : vencido ? "Vencido" : "Disponível");
      const dica = !disponivel ? (c.usado_em && c.tipo !== "plano" ? "Usado em " + data(c.usado_em) : "Venceu em " + data(c.expira_em))
        : c.tipo === "servico" ? "Use ao agendar: no passo 05 Confirmar, marque o cupom."
        : c.tipo === "plano" ? "Seu plano vale até " + data(c.expira_em) + "."
        : "Mostre este cupom na barbearia para retirar o prêmio.";
      return `<article class="cupom-c ${disponivel ? "cupom-c--ok" : "cupom-c--off"}">
        <div class="cupom-c__topo"><p class="cupom-c__premio">${esc(c.premio)}</p><span class="cupom-c__selo">${situacao}</span></div>
        <p class="cupom-c__datas">Resgatado em ${data(c.resgatado_em)} · ${disponivel ? "vale até " + data(c.expira_em) : "código " + esc(c.codigo)}</p>
        <p class="cupom-c__dica">${dica}</p>
      </article>`;
    }).join("");
  }

  f.elements.codigo.addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""); erro.textContent = ""; });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo = f.elements.codigo.value.trim();
    if (!codigo) { erro.textContent = "Digite o código do cupom."; f.elements.codigo.focus(); return; }
    if (!ctx.cliente) return toast("Prévia: o banco ainda não está conectado.", "erro");
    const b = f.querySelector("[type=submit]"); b.disabled = true;
    const { data: r, error } = await ctx.cliente.rpc("resgatar_cupom", { p_codigo: codigo });
    b.disabled = false;
    if (error) { erro.textContent = "Não foi possível resgatar agora. Tente de novo."; return; }
    if (!r.ok) { erro.textContent = ERROS[r.erro] || ERROS.invalido; return; }
    f.reset();
    toast("Prêmio resgatado: " + r.premio);
    listar();
  });
  listar();
}

const TELAS = { conta: telaConta, agendamentos: telaAgendamentos, plano: telaPlano, clube: telaClube };

/* ---------------- início ---------------- */
pintarFoto();
const inicial = abaDoEndereco();
if (inicial) abrirPainel(inicial, false);

// ponte para os scripts do site (agendamento e planos): mesma sessão, mesmo login
const API = {
  configurado,
  usuario: () => ctx.usuario,
  perfil: () => ctx.perfil,
  cliente: async () => { await preparar(); return ctx.cliente; },
  ouvir: (fn) => { ouvintes.push(fn); },
  // abre o painel para entrar/criar conta e devolve o usuário quando entrar (ou null se fechar sem entrar)
  pedirLogin: (texto) => new Promise(async (resolver) => {
    await preparar();
    if (ctx.usuario) return resolver(ctx.usuario);
    if (pedido) pedido.resolver(null);
    pedido = { texto, resolver };
    modoEntrar = "senha"; pendente = null;
    if (abaDoEndereco()) mostrar(abaDoEndereco()); else location.hash = "#conta";
  }),
  sair: async () => { await preparar(); if (ctx.cliente) await ctx.cliente.auth.signOut(); }
};
preparar().then(() => {
  pintarMenu();
  window.__r10ContaPronta && window.__r10ContaPronta(API);
});
