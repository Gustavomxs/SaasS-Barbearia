// =====================================================================
// R10 — cliente Supabase (carregado só quando configurado)
// =====================================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const configurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let cliente = null;
export async function sb() {
  if (!configurado) return null;
  if (cliente) return cliente;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
  cliente = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "r10-auth" }
  });
  return cliente;
}

// erros das funções do banco → mensagens para o cliente
const MENSAGENS = {
  login: "Sua sessão expirou. Entre de novo.",
  dados: "Confira seu nome e WhatsApp.",
  servico: "Algum serviço não está mais disponível.",
  horario: "Esse horário não está mais disponível. Escolha outro.",
  ocupado: "Esse horário acabou de ser ocupado. Escolha outro.",
  limite: "Você já tem 2 horários marcados. Cancele um para marcar outro.",
  nao_encontrado: "Não encontramos esse horário.",
  prazo: "Faltam menos de 2 horas para o horário: o cancelamento pelo site já fechou. Fale com a barbearia pelo WhatsApp.",
  nota: "Escolha de 1 a 5 estrelas."
};
export function mensagemErro(erro) {
  const chave = String(erro?.message || "").trim();
  return MENSAGENS[chave] || "Algo deu errado. Tente de novo em instantes.";
}
