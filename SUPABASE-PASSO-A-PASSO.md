# Supabase + Gmail — passo a passo (Etapa 2)

Tempo: uns 20 minutos. Senhas **nunca** vão para o chat: só a URL do projeto e a chave pública (Parte 3).

---

## Parte 1 — Criar o projeto
1. Entre em **supabase.com/dashboard** com a sua conta.
2. **New project**
   - **Name:** `r10-barbearia`
   - **Database Password:** clique em **Generate a password** e guarde num lugar seguro (não precisa me mandar).
   - **Region:** **South America (São Paulo)**
   - Plano **Free** → **Create new project**. Espere uns 2 minutos até ficar pronto.

## Parte 2 — Criar o banco
3. No menu da esquerda: **SQL Editor** → **New query**.
4. Na pasta do projeto, abra `supabase\migrations\0001_base.sql` no Bloco de Notas → **Ctrl+A**, **Ctrl+C**.
5. Cole no SQL Editor → **Run**. Se aparecer um aviso sobre "destructive operation", confirme.
   Resultado esperado: **Success. No rows returned**.

## Parte 3 — Chaves do site (estas duas pode mandar no chat: são públicas)
6. **Project Settings** (engrenagem, embaixo à esquerda):
   - **Data API** → copie a **Project URL** (ex.: `https://abcd1234.supabase.co`).
   - **API Keys** → copie a chave **anon public** (aba *Legacy API keys*) **ou** a **Publishable key** (`sb_publishable_…`).
7. Mande as duas aqui no chat.
   ⚠️ **Nunca** mande a `service_role` / **Secret key** — essa é a chave-mestra do banco.

## Parte 4 — Login por e-mail
8. **Authentication → Sign In / Providers → Email**
   - **Enable Email provider:** ligado
   - **Confirm email:** ligado
   - **Secure email change:** ligado
   - **Minimum password length:** `8`
   - **Email OTP Length:** `6`
   - **Email OTP Expiration:** `900` (15 minutos)
   - **Save**
9. **Authentication → URL Configuration**
   - **Site URL:** `https://r10-barbearia.vercel.app`
   - **Redirect URLs** → **Add URL**: `https://r10-barbearia.vercel.app/**` e `http://localhost:4600/**`

## Parte 5 — Gmail que envia os códigos (r10.barbearia01@gmail.com)
10. Entre nesse Gmail e abra **myaccount.google.com/security** → ative a **Verificação em duas etapas** (o Google exige isso para a próxima tela).
11. Abra **myaccount.google.com/apppasswords** → nome: `Supabase R10` → **Criar** → copie os 16 caracteres (sem espaços). **Não mande para mim.**
12. No Supabase: **Authentication → Emails → SMTP Settings** → **Enable custom SMTP**
    - **Sender email:** `r10.barbearia01@gmail.com`
    - **Sender name:** `R10 Barbearia`
    - **Host:** `smtp.gmail.com`
    - **Port:** `465`
    - **Username:** `r10.barbearia01@gmail.com`
    - **Password:** a senha de app do passo 11
    - **Save**
13. **Authentication → Rate Limits** → *Rate limit for sending emails*: `100` por hora → **Save**.
    (O Gmail aguenta até ~500 e-mails por dia: sobra para a R10.)

## Parte 6 — Textos dos e-mails (com o código de 6 dígitos)
14. **Authentication → Emails → Templates**. Em cada um, troque o **Subject** e o **Body** (aba *Source*) e clique **Save**:

**Confirm signup**
- Subject: `Seu código para criar a conta — R10 Barbearia`
- Body:
```html
<h2>Bem-vindo à R10 Barbearia</h2>
<p>Digite este código no site para confirmar seu e-mail:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>O código vale por 15 minutos. Se não foi você, ignore este e-mail.</p>
```

**Magic Link**
- Subject: `Seu código de acesso — R10 Barbearia`
- Body:
```html
<h2>Entrar na R10 Barbearia</h2>
<p>Digite este código no site para entrar:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>O código vale por 15 minutos. Se não foi você, ignore este e-mail.</p>
```

**Reset Password**
- Subject: `Código para criar uma nova senha — R10 Barbearia`
- Body:
```html
<h2>Nova senha</h2>
<p>Digite este código no site para criar uma nova senha:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>O código vale por 15 minutos. Se não foi você, ignore este e-mail.</p>
```

---

Pronto. Depois de mandar a **Project URL** e a **chave pública**, eu ligo o site no banco e testamos juntos.
