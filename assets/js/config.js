// =====================================================================
// R10 — configuração pública do Supabase
// A "anon key" é pública por natureza: a segurança vem das regras (RLS)
// do banco, não de esconder esta chave. NUNCA coloque aqui a service_role.
// =====================================================================
export const SUPABASE_URL = "https://yoororuzyaqhpvbpfirq.supabase.co";
// chave "anon public" (papel anon): pode ficar no site, quem protege os dados são as regras (RLS)
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlvb3JvcnV6eWFxaHB2YnBmaXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMTgwNDAsImV4cCI6MjEwOTg5NDA0MH0.5VgQuvfN2m4xvo-MCLMZ8nBlb5Xvx9aEAgkM93aKA3s";

export const SITE = {
  nome: "R10 Barbearia",
  whatsapp: "5543999850351",
  instagram: "https://www.instagram.com/r10._barbearia/"
};
