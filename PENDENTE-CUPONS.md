# R10 Barbearia — o que já está pronto e o que falta (atualizado em 17/11/2026)

## Pronto
- Site animado + agendamento com conta (Supabase), comprovante no WhatsApp, modo leve para celular fraco.
- **Cupons do Clube**: dono cria/edita (no /gestor → Cupons), cliente resgata (Sua conta → Clube), verde = disponível,
  cinza riscado = usado/vencido; cupom de serviço usado no passo 05 do agendamento (sai de graça); cupom de plano ativa o plano.
  Testado no banco: resgate, código repetido/inválido, agendamento com cupom (R$ 0), cancelamento devolve o cupom.
- **Painel dos barbeiros** `/agenda` (instalável no celular): abas por barbeiro, dia, WhatsApp, Concluído (pago),
  Cancelar, Confirmar, bloquear horário ou dia inteiro, notificações e atualização ao vivo.
- **Painel Gestor** `/gestor` (só o dono): Dashboard ao vivo com alerta sonoro, ranking e comissões; Agenda geral;
  Serviços (preço, duração, ativo, novos combos); Equipe (foto, telefone, expediente, almoço, comissão, ativo);
  Configurações (aberta/fechada, aviso no topo do site, WhatsApp, Instagram, endereços, regras); Cupons; Assinantes.
  Testado: mudar preço e aviso no banco aparece no site aberto na hora, sem recarregar.
- Menu do celular: "Sua conta" em cima e Agendar/Recorde/Planos alinhados.
- Publicado: painel em r10-barbearia.vercel.app/agenda e /gestor. O site está em "Em breve" (tirar-do-ar.ps1).

## Falta
- [ ] **E-mails dos barbeiros (José, Rhequelmy, Fabio)** — criar as contas (Supabase → Authentication → Add user)
      e ligar cada uma: `update profissionais_privado set usuario_id = (select id from auth.users where email = '...') where profissional_id = 'jose';`
- [ ] **Chaves das notificações** — o Gustavo roda uma vez: `powershell -NoProfile -ExecutionPolicy Bypass -File .\plataforma\configurar-push.ps1`
      e depois publica de novo (`tirar-do-ar.ps1`, ou `publicar-vercel.ps1` para o site completo).
- [ ] Teste no celular: instalar "R10 Agenda", ativar notificações, agendar e ver o aviso chegar.
- [ ] Pagamento online (Asaas): depende do dono criar a conta Asaas e mandar os documentos.
- [ ] Quando quiser o site no ar para os clientes: `publicar-vercel.ps1`.
