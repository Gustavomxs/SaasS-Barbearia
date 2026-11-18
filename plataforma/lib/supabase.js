// Cliente Supabase do painel. A chave "anon" é pública (a segurança vem das regras RLS do banco).
// Mesma "storageKey" do site: quem entrou no site já está logado no painel (mesmo endereço).
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yoororuzyaqhpvbpfirq.supabase.co";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlvb3JvcnV6eWFxaHB2YnBmaXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMTgwNDAsImV4cCI6MjEwOTg5NDA0MH0.5VgQuvfN2m4xvo-MCLMZ8nBlb5Xvx9aEAgkM93aKA3s";

let cliente = null;
export function sb() {
  if (!cliente) {
    cliente = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "r10-auth" }
    });
  }
  return cliente;
}
