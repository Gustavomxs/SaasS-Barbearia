# R10 Barbearia — Plataforma completa: plano técnico

Status: **proposta para aprovação** (nenhum código desta fase escrito ainda).

## 1. Decisão de stack

| Camada | Escolha | Por quê |
|---|---|---|
| Banco + Login + Segurança | **Supabase** (plano gratuito) | Postgres de verdade (agenda sem conflito garantida pelo banco), login Google + e-mail/senha + recuperação de senha + **2FA (TOTP) nativos**, regras de acesso por linha (RLS), funções no servidor |
| Funções de servidor | Supabase **Edge Functions** (Deno) | Sincronizar Google Agenda, feed de calendário, notificações push |
| Front-end | HTML/CSS/JS do site atual + **módulos ES** + `supabase-js` (sem etapa de build) | Mantém 100% o visual e o motor de animação; não exige Node instalado |
| Hospedagem | **Cloudflare Pages** (grátis, uso comercial permitido) | O plano grátis da Vercel (Hobby) é só para uso **não comercial**; para a R10 seria a Vercel Pro (US$ 20/mês) |
| E-mails (confirmação, senha) | SMTP próprio: **Resend** (precisa de domínio) ou **Gmail com senha de app** | O e-mail embutido do Supabase grátis manda só poucos e-mails por hora |
| Anti-robô | **Cloudflare Turnstile** no cadastro/login | Impede criação de contas falsas em massa |

Por que não Firebase: banco NoSQL não garante "dois agendamentos no mesmo horário" de forma atômica sem código extra; 2FA TOTP exige plano pago (Identity Platform); regras de acesso ficam mais frágeis para dados relacionais (agendamento ↔ serviços ↔ profissional ↔ avaliação).

## 2. Banco de dados (Postgres no Supabase)

Catálogo (leitura pública):
- `unidades` (id, slug, nome, endereco, maps_url)
- `profissionais` (id, unidade_id, nome, foto_url, ativo, email_google)
- `expedientes` (profissional_id, dia_semana 0–6, inicio, fim)
- `servicos` (id, nome, preco_centavos, **duracao_min**, destaque, ordem, ativo)
- `planos` (id, nome, preco_centavos, vigencia, vantagens[], termos_url)
- `parceiros` (id, nome, categoria, descricao, logo_url, beneficio, validade_cupom_horas, ativo)
- `bloqueios` (id, profissional_id ou null = todos, inicio, fim, motivo) — folgas, almoço, feriados extras

Dados do cliente (cada um só vê o próprio — RLS):
- `perfis` (id = usuário, nome, telefone, nascimento, cpf, cep, rua, numero, complemento, bairro, cidade, uf, aceite_termos_em, notificacoes)
- `agendamentos` (id, cliente_id, unidade_id, profissional_id, inicio, fim, status: agendado | cancelado | concluido | falta, total_centavos, google_event_id)
  - **trava no banco:** `EXCLUDE USING gist (profissional_id WITH =, tstzrange(inicio, fim) WITH &&) WHERE status = 'agendado'` → é impossível existir dois horários sobrepostos para o mesmo barbeiro, mesmo com dois cliques no mesmo segundo
- `agendamento_servicos` (agendamento_id, servico_id, preco_centavos, duracao_min) — cópia do preço do dia
- `avaliacoes` (agendamento_id, cliente_id, nota 1–5, comentario) — só para atendimentos concluídos do próprio cliente
- `assinaturas` (cliente_id, plano_id, status, inicio, fim, origem)
- `cupons` (id, parceiro_id, cliente_id, codigo, gerado_em, expira_em, usado_em)
- `push_inscricoes` (cliente_id, endpoint, chaves, dispositivo)
- `feed_calendario` (cliente_id, token secreto)

Regras no servidor (funções do banco, `security definer`, validam tudo):
- `horarios_livres(profissional|qualquer, data, servicos[])` → respeita expediente, duração real somada, bloqueios, feriados nacionais, antecedência
- `agendar(...)` → calcula preço e duração no servidor, aplica **máx. 2 futuros por cliente**, grava
- `cancelar(id)` → só o dono, só horário futuro
- `avaliar(id, nota, comentario)`
- `gerar_cupom(parceiro)` → só assinante ativo
- `minhas_sessoes()` / `encerrar_sessao(id)` → lê/encerra as sessões do próprio usuário (dispositivo, IP, último acesso)

## 3. Google Agenda

**Agenda da barbearia (espelho automático, como hoje):** cada agendamento criado/cancelado no Supabase dispara uma Edge Function que cria/apaga o evento na agenda da R10 usando uma **conta de serviço** do Google (a agenda é compartilhada com ela). Mantém: nome do cliente no título, horário certo, aviso no celular e convite para o barbeiro.

**Agenda do cliente ("Integrações → Google Agenda"):**
- Fase 1: **feed de calendário privado** (link `webcal://` único por cliente). Funciona no Google Agenda, iPhone e Outlook; atualiza sozinho (o Google leva de algumas horas a 1 dia para atualizar). Botão "Conectar Google Agenda" adiciona o feed.
- Fase 2 (opcional): sincronização instantânea via OAuth com permissão de calendário. **Exige verificação do app pelo Google** (política de privacidade publicada, domínio próprio, análise que pode levar semanas).

## 4. Front-end

```
/index.html          site atual (vitrine + agendamento; login só na confirmação)
/entrar.html         login, cadastro (termos + privacidade), esqueci a senha, nova senha, 2FA
/app.html            área do cliente: #inicio #agendamentos #plano #clube #perfil #seguranca
/assets/css/         tokens.css (paleta, tipos, espaços extraídos do site) · componentes.css · app.css
/assets/js/          supabase.js · sessao.js · agenda.js (motor de agendamento, usado no site e no app)
                     ui.js (modal, folha inferior, toast, skeleton, estrela) · paginas/*.js
/sites-incriveis.*   motor de animação (inalterado)
```
Navegação: menu lateral no computador, barra inferior no celular. Skeletons em todo carregamento, transições curtas, nada de tela branca.

## 5. Etapas

| # | Etapa | Entrega |
|---|---|---|
| 0 | **Base** | Projeto Supabase, tabelas + RLS + dados reais (unidades, barbeiros, expedientes, serviços, planos), design tokens, componentes, casca do app |
| 1 | **Conta** | Login Google, e-mail/senha, cadastro com termos, esqueci a senha, sessão de 30 dias |
| 2 | **Agendamento** | Motor no banco (sem conflito), duração real, barra fixa, pop-up de upsell, espelho na agenda da R10 + aviso no celular |
| 3 | **Área do cliente** | Início, Agendamentos (Agendados/Anteriores, cancelar, calendário, avaliação ★) |
| 4 | **Plano + Clube** | Planos, compra (link de pagamento), Clube com filtros, cupons, guia e FAQ |
| 5 | **Perfil + Segurança** | Perfil com CEP automático, senha, 2FA com QR Code, sessões ativas, feed de calendário, notificações push |
| 6 | **Publicação** | Domínio, hospedagem, e-mails, testes no celular real, migração do Apps Script |

## 6. Pendências que bloqueiam
1. Cashbarber continua ou será desligado? (dois sistemas na mesma agenda = horário duplicado)
2. Pagamento dos planos: Cashbarber, Mercado Pago/Asaas ou WhatsApp?
3. Clube do assinante: lista real de parceiros, benefícios, regras do cupom e respostas da FAQ
4. Duração real de cada serviço
5. Domínio próprio (ex.: r10barbearia.com.br)
6. Textos de Termos de Uso e Política de Privacidade (LGPD — o perfil guarda CPF e endereço)
