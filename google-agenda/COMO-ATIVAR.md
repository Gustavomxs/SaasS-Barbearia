# Agenda online da R10 — ativação e atualização

Tudo é feito logado em **gustavomxs.2007@gmail.com** (a conta do Google Agenda da R10).

## Onde cada coisa chega
| O quê | Onde |
|---|---|
| **Marcação** (nome, e-mail verificado, WhatsApp, serviços, dia e horário) | Google Agenda dessa conta, agenda principal |
| **Notificação no celular** a cada agendamento | App Google Agenda, em ~2 min, pela agenda "R10 – Avisos" |
| **E-mail da marcação** para a barbearia | Gmail gustavomxs.2007@gmail.com (se sobrar cota do dia) |
| **Confirmação + link de cancelar** para o cliente | E-mail que o cliente confirmou no login |

---

## PARTE A — Criar o "ID do cliente" do Google (login "Continuar com Google")

Gratuito, ~5 minutos.

1. Abra **https://console.cloud.google.com** logado em gustavomxs.2007@gmail.com.
2. No topo, clique no **seletor de projeto** → **Novo projeto** → nome `R10 Barbearia` → **Criar**. Confira se o projeto novo ficou selecionado no topo.
3. Menu ☰ → **APIs e serviços** → **Tela de consentimento OAuth** (em algumas contas aparece como **Google Auth Platform**) → **Começar**:
   - Nome do app: `R10 Barbearia`
   - E-mail de suporte: o seu
   - Público: **Externo**
   - E-mail de contato: o seu → **Criar**
4. Em **Público-alvo** (Audience), clique em **Publicar app** → confirmar. (O login usa só nome e e-mail, então o Google não exige verificação.)
5. Vá em **Clientes** (ou **Credenciais** → **Criar credenciais** → **ID do cliente OAuth**):
   - Tipo de aplicativo: **Aplicativo da Web**
   - Nome: `Site R10`
   - **Origens JavaScript autorizadas** → adicione:
     - `http://localhost`
     - `http://localhost:4600`
     - `https://SEU-PROJETO.vercel.app` (adicione depois do deploy na Vercel)
   - Deixe "URIs de redirecionamento" vazio → **Criar**
6. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`). Não precisa da "chave secreta".
7. Cole o ID em **dois lugares**:
   - `index.html` → `var R10_GOOGLE_CLIENT_ID = "COLE-AQUI";`
   - `Codigo.gs` → `GOOGLE_CLIENT_ID: 'COLE-AQUI',`

> O botão "Continuar com Google" só aparece no site depois do passo 7. Até lá, o cliente entra com o código por e-mail.

---

## PARTE B — Atualizar o script (obrigatório: a versão nova tem o login)

1. Abra o projeto **R10 Agenda** em https://script.google.com.
2. Apague o conteúdo de `Codigo.gs` e cole o arquivo `Codigo.gs` novo desta pasta.
3. Abra `appsscript.json` e substitua pelo `appsscript.json` desta pasta (ele pede uma permissão nova: chamar o Google para conferir o login).
4. Salve (Ctrl+S). Escolha a função **testar** → **Executar** → autorize de novo (Avançado → Acessar R10 Agenda → Permitir).
5. **Implantar → Gerenciar implantações** → clique no **lápis** da implantação atual → em *Versão* escolha **Nova versão** → **Implantar**.
   A URL `/exec` continua a mesma — o site não precisa mudar.

> Até você fazer a Parte B, o site novo não consegue confirmar agendamentos (ele pede login e o script antigo não sabe fazer login).

---

## Como funciona a segurança
- **Ninguém agenda sem entrar**: com Google (o script confere o login no próprio Google) ou com um código de 6 dígitos enviado ao e-mail (vale 10 min, até 5 tentativas, até 3 códigos por hora).
- A pessoa fica **conectada por 30 dias** no aparelho — da próxima vez é só escolher e confirmar.
- **No máximo 2 horários futuros por pessoa** — impede alguém de lotar a agenda.
- **Preço e duração são calculados no script**, não no navegador.
- Cada marcação guarda o **e-mail verificado** de quem marcou.
- O cliente recebe um **link para cancelar**, e também pode cancelar pelo site (etapa "Confirmar", em "Seus próximos horários").
- O segredo que assina as sessões fica nas Propriedades do script e é criado sozinho — nunca vai para o site.

## Cota de e-mail
Conta Gmail comum envia ~100 e-mails por dia. O script prioriza: (1) códigos de login, (2) confirmação ao cliente, (3) cópia para a barbearia — esta última só se sobrar cota (a notificação no celular chega de qualquer jeito). Quem entra com Google não gasta código.

## Duração dos serviços
Em `Codigo.gs` (CONFIG.SERVICOS, campo `min`) e em `index.html` (lista SERVICOS, campo `min`). **Hoje todos estão com 30 min, aguardando a barbearia confirmar.** Combinações somam: Corte + Barba = 60 min. Mudou? Atualize os dois arquivos e faça a Parte B, passo 5.

## Expediente
- **José (Cidade Alta):** seg–sex 13:00–19:30 · sáb 09:00–17:30
- **Rhequelmy L (Fluviopolis):** seg–sex 09:00–19:30 · sáb 09:00–15:30
- **Fabio (Fluviopolis):** seg–sex 09:00–19:30 · sáb 09:00–15:30
- Domingo fechado. Feriados nacionais bloqueados automaticamente todo ano (1/1, Sexta-feira Santa, 21/4, 1/5, 7/9, 12/10, 2/11, 15/11, 20/11, 25/12). Outras folgas: `FOLGAS_EXTRAS`.
- **Bloquear horário à mão:** evento na agenda principal com o nome do barbeiro no título (ex.: `Fabio almoço`). `Todos` ou `Fechado` bloqueia a equipe.
- Atenção: como é a agenda principal, eventos pessoais com esses nomes também bloqueiam.

## Testar a notificação
No editor, rode **testarAviso**: o celular deve apitar em ~2 min e chegar um e-mail.
