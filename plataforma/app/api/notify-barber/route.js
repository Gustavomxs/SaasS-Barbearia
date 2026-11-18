// POST /api/notify-barber  { id: "<agendamento>" }
// Chamado pelo próprio banco (Supabase, pg_net) logo depois que um agendamento é criado.
// O banco só devolve os dados do aviso UMA vez e só nos 5 minutos seguintes ao agendamento
// (função dados_push) — então esta rota não precisa de senha e não pode ser usada para spam.
import webpush from "web-push";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function rpc(nome, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store"
  });
  if (!r.ok) throw new Error(`rpc ${nome}: ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

export async function POST(req) {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) return Response.json({ ok: false, erro: "vapid" }, { status: 500 });

  let id;
  try { ({ id } = await req.json()); } catch { return Response.json({ ok: false, erro: "formato" }, { status: 400 }); }
  if (!UUID.test(String(id || ""))) return Response.json({ ok: false, erro: "id" }, { status: 400 });

  const dados = await rpc("dados_push", { p_id: id });
  if (!dados || !dados.subscription) return Response.json({ ok: true, enviado: false });   // já avisado, antigo ou barbeiro sem celular ativado

  webpush.setVapidDetails(process.env.VAPID_EMAIL || "mailto:r10.barbearia01@gmail.com", publica, privada);
  try {
    await webpush.sendNotification(dados.subscription, JSON.stringify({
      titulo: dados.titulo, corpo: dados.corpo, url: "/agenda", tag: "agendamento-" + id
    }), { TTL: 60 * 60 * 6, urgency: "high" });
    return Response.json({ ok: true, enviado: true });
  } catch (e) {
    // 404/410 = o celular desinstalou ou trocou: apaga o endereço para não tentar de novo
    if (e && (e.statusCode === 404 || e.statusCode === 410)) {
      await rpc("push_expirado", { p_profissional: dados.profissional, p_endpoint: dados.subscription.endpoint }).catch(() => {});
    }
    return Response.json({ ok: false, erro: "envio" }, { status: 502 });
  }
}
