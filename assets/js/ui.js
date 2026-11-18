// =====================================================================
// R10 — utilidades de interface: ícones, toast, modal, skeleton, formatos
// =====================================================================

const svg = (d, extra = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const icone = {
  inicio:   svg('<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>'),
  agenda:   svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>'),
  plano:    svg('<path d="m12 3 8 4-8 4-8-4 8-4z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/>'),
  clube:    svg('<rect x="3" y="6" width="18" height="13" rx="2"/><circle cx="9" cy="12" r="2.2"/><path d="M14 11h4M14 14h3M6 16c.6-1.4 1.8-2 3-2s2.4.6 3 2"/>'),
  perfil:   svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  seta:     svg('<path d="M5 12h14m-6-6 6 6-6 6"/>'),
  mais:     svg('<path d="M12 5v14M5 12h14"/>'),
  check:    `<svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7.5 5.5 11 12 3.5" stroke="#740200" stroke-width="2.4"/></svg>`,
  estrela:  `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>`,
  escudo:   svg('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  sino:     svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'),
  google:   `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>`
};

/* ---------- formatos ---------- */
export const reais = (centavos) => "R$ " + (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FUSO = "America/Sao_Paulo";
export function dataLonga(iso) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })
    .replace(/^./, (c) => c.toUpperCase()).replace(" às", ",");
}
export function partesData(iso) {
  const d = new Date(iso);
  return {
    dia: d.toLocaleString("pt-BR", { timeZone: FUSO, day: "2-digit" }),
    mes: d.toLocaleString("pt-BR", { timeZone: FUSO, month: "short" }).replace(".", ""),
    hora: d.toLocaleString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" })
  };
}

/* ---------- toast ---------- */
export function toast(msg, tipo = "ok") {
  const box = document.getElementById("toasts");
  if (!box) return;
  const t = document.createElement("div");
  t.className = "toast" + (tipo === "erro" ? " toast--erro" : "");
  t.setAttribute("role", tipo === "erro" ? "alert" : "status");
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.classList.add("sai"); setTimeout(() => t.remove(), 320); }, tipo === "erro" ? 5200 : 3200);
}

/* ---------- modal (vira folha inferior no celular) ---------- */
export function modal({ titulo, texto = "", html = "", acoes = [] }) {
  const dlg = document.getElementById("modal");
  const caixa = document.getElementById("modal-caixa");
  return new Promise((resolver) => {
    caixa.innerHTML =
      `<h2 class="modal__titulo">${esc(titulo)}</h2>` +
      (texto ? `<p class="modal__texto">${esc(texto)}</p>` : "") + html +
      `<div class="modal__acoes">${acoes.map((a, i) =>
        a.tipo === "link"
          ? `<button type="button" class="link-botao" data-i="${i}">${esc(a.rotulo)}</button>`
          : `<button type="button" class="botao botao--cheio ${a.classe || "botao--vinho"}" data-i="${i}">${esc(a.rotulo)}</button>`
      ).join("")}</div>`;
    const fechar = (valor) => { dlg.close(); resolver(valor); };
    caixa.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => fechar(acoes[+b.dataset.i].valor)));
    dlg.onclick = (e) => { if (e.target === dlg) fechar(null); };
    dlg.oncancel = () => resolver(null);
    dlg.showModal();
  });
}

/* ---------- skeleton e vazio ---------- */
export const esqueleto = (n = 3, tipo = "cartao") =>
  Array.from({ length: n }, () => `<span class="esqueleto esqueleto--${tipo}" style="margin-bottom:12px"></span>`).join("");

export const vazio = (titulo, texto, acaoHtml = "") =>
  `<div class="vazio"><p class="vazio__titulo">${esc(titulo)}</p><p class="vazio__texto">${esc(texto)}</p>${acaoHtml}</div>`;

/* ---------- estrelas ---------- */
export function estrelasHtml(nota = 0, fixo = false) {
  return `<span class="estrelas" ${fixo ? "data-fixo" : ""} role="${fixo ? "img" : "radiogroup"}" aria-label="${nota ? nota + " de 5 estrelas" : "Avaliar de 1 a 5"}">` +
    [1, 2, 3, 4, 5].map((n) => `<button type="button" class="estrela${n <= nota ? " acesa" : ""}" data-nota="${n}" ${fixo ? "tabindex='-1' disabled" : ""} aria-label="${n} estrela${n > 1 ? "s" : ""}">${icone.estrela}</button>`).join("") +
    `</span>`;
}

/* ---------- calendário do cliente (.ics) ---------- */
export function linkIcs({ titulo, inicio, fim, local, descricao }) {
  const z = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const e = (s) => String(s).replace(/([,;\\])/g, "\\$1");
  const l = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//R10 Barbearia//PT", "BEGIN:VEVENT",
    "UID:" + z(inicio) + "-" + Math.random().toString(36).slice(2) + "@r10barbearia",
    "DTSTAMP:" + z(new Date()), "DTSTART:" + z(inicio), "DTEND:" + z(fim),
    "SUMMARY:" + e(titulo), "LOCATION:" + e(local || ""), "DESCRIPTION:" + e(descricao || ""),
    "BEGIN:VALARM", "TRIGGER:-PT60M", "ACTION:DISPLAY", "DESCRIPTION:R10 Barbearia", "END:VALARM", "END:VEVENT", "END:VCALENDAR"];
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(l.join("\r\n"));
}
