// =====================================================================
// R10 — acesso a dados. Sem banco conectado, usa só os dados reais fixos.
// =====================================================================
import { esc, reais, partesData, dataLonga, icone } from "./ui.js";

export const PLANOS_LOCAIS = [
  { id: "corte-ilimitado", nome: "Plano Corte Ilimitado", preco_centavos: 9500, vigencia: "Indeterminado", vantagens: [], termos_url: null, checkout_url: null },
  { id: "cabelo-barba-ilimitado", nome: "Cabelo e barba ilimitado", preco_centavos: 13000, vigencia: "Indeterminado", vantagens: [], termos_url: null, checkout_url: null }
];

export const CATEGORIAS = ["Tudo", "Conveniência", "Esportes", "Gastronomia", "Lazer", "Limpeza", "Saúde / Estética", "Serviços", "Vestuário"];

export async function carregarPlanos(ctx) {
  if (!ctx.cliente) return PLANOS_LOCAIS;
  const { data, error } = await ctx.cliente.from("planos").select("*").order("ordem");
  return error || !data?.length ? PLANOS_LOCAIS : data;
}

export async function assinaturaAtiva(ctx) {
  if (!ctx.cliente) return null;
  const { data } = await ctx.cliente.from("assinaturas")
    .select("status, inicio, fim, planos(nome, preco_centavos)")
    .eq("status", "ativa").order("criado_em", { ascending: false }).limit(1);
  return data?.[0] || null;
}

const CAMPOS_AGEND = "id, inicio, fim, status, total_centavos, pagamento_status, profissionais(nome), unidades(nome, endereco), agendamento_servicos(nome)";

export async function proximosAgendamentos(ctx, limite = 20) {
  if (!ctx.cliente) return [];
  const { data, error } = await ctx.cliente.from("agendamentos").select(CAMPOS_AGEND)
    .eq("status", "agendado").gte("inicio", new Date().toISOString()).order("inicio").limit(limite);
  if (error) throw error;
  return data || [];
}

export async function agendamentosAnteriores(ctx, limite = 50) {
  if (!ctx.cliente) return [];
  const { data, error } = await ctx.cliente.from("agendamentos").select(CAMPOS_AGEND)
    .in("status", ["agendado", "concluido", "falta"]).lt("fim", new Date().toISOString())
    .order("inicio", { ascending: false }).limit(limite);
  if (error) throw error;
  return data || [];
}

/* cartão de agendamento usado no Início e em Agendamentos */
export function cartaoAgendamento(a, acoesHtml = "") {
  const p = partesData(a.inicio);
  const servicos = (a.agendamento_servicos || []).map((s) => s.nome).join(", ");
  return `<article class="agend" data-id="${esc(a.id)}">
    <div class="agend__data"><b>${esc(p.dia)}</b><span>${esc(p.mes)}</span></div>
    <div>
      <p class="agend__quando">${esc(dataLonga(a.inicio))}</p>
      <p class="agend__info">${esc(servicos)}${a.profissionais?.nome ? " · " + esc(a.profissionais.nome) : ""}${a.unidades?.nome ? " · " + esc(a.unidades.nome) : ""}</p>
    </div>
    <p class="agend__total">${reais(a.total_centavos)}</p>
    ${acoesHtml ? `<div class="agend__acoes">${acoesHtml}</div>` : ""}
  </article>`;
}

export const botaoNovoAgendamento = (classe = "") =>
  `<a class="botao ${classe}" href="#agendar">${icone.mais}Novo agendamento</a>`;
