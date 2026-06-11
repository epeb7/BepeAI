# BepeAI — Guia de Deploy em Produção

## Pré-requisitos

- Conta no [Render](https://render.com) (backend Node.js)
- Conta no [Vercel](https://vercel.com) (frontend React)
- Projeto no [Supabase](https://supabase.com) (banco de dados)
- Conta no [Groq](https://console.groq.com) (API de IA)
- Conta no [Resend](https://resend.com) (e-mails — opcional mas recomendado)

---

## 1. Banco de Dados (Supabase)

### 1.1 Executar as migrations na ordem correta

Abrir o **SQL Editor** do Supabase e executar cada arquivo abaixo **na ordem listada**:

| Ordem | Arquivo | Descrição |
|-------|---------|-----------|
| 1 | `docs/supabase_schema.sql` | Schema base: todas as tabelas principais e RLS |
| 2 | `docs/migration_users.sql` | Colunas de perfil na tabela users (name, role, active) |
| 3 | `docs/migration_tenant.sql` | Colunas multi-tenant (logo_base64, company_name, brand_color, template_overrides, preferred_tone) |
| 4 | `docs/migration_files.sql` | Tabela de arquivos enviados pelos usuários |
| 5 | `docs/migration_memory.sql` | Tabela de memória persistente do usuário |
| 6 | `docs/migration_password_reset.sql` | Tabela de tokens para redefinição de senha |
| 7 | `docs/migration_invite_tokens_v2.sql` | Tabela de convites (substitui v1 se existir) |

> Se for criar o banco do zero, execute apenas o schema.sql + as migrations na ordem acima.
> Se alguma migration falhar por coluna/tabela já existente, pode ignorar o erro e continuar.

### 1.2 Habilitar pg_cron e executar jobs de limpeza

1. No Supabase Dashboard → **Database → Extensions** → habilitar `pg_cron`
2. No **SQL Editor**, executar: `docs/migration_cron_cleanup.sql`
3. Verificar se os jobs foram criados:
   ```sql
   SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;
   ```

### 1.3 Configurar usuário admin inicial

Criar o usuário admin via SQL (ajustar e-mail e hash de senha):

```sql
-- Gerar hash: node -e "const b=require('bcryptjs'); b.hash('SUA_SENHA_AQUI', 12).then(console.log)"
INSERT INTO users (email, name, password_hash, role, active)
VALUES (
  'admin@bepeai.com',
  'Administrador',
  '$2b$12$SEU_HASH_AQUI',
  'admin',
  true
)
ON CONFLICT (email) DO UPDATE SET role = 'admin', active = true;
```

### 1.4 Configurar Storage (para uploads de arquivo)

No Supabase Dashboard → **Storage**:
1. Criar bucket `user-files` com acesso **privado**
2. Criar bucket `logos` com acesso **privado** (se usar storage em vez de base64)

---

## 2. Backend (Render)

### 2.1 Criar Web Service no Render

- **Root Directory:** `backend`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `node dist/server.js`
- **Node Version:** 18+

### 2.2 Variáveis de ambiente obrigatórias

| Variável | Como obter |
|----------|-----------|
| `NODE_ENV` | `production` |
| `PORT` | `3001` (Render define automaticamente) |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key |
| `ADMIN_EMAIL` | e-mail do admin (ex: `admin@bepeai.com`) |
| `ADMIN_PASSWORD_HASH` | hash bcrypt da senha admin |
| `FRONTEND_URL` | URL do Vercel (ex: `https://bepeai.vercel.app`) |
| `ALLOWED_ORIGINS` | mesmo valor do `FRONTEND_URL` |

**Variáveis opcionais:**

| Variável | Descrição |
|----------|-----------|
| `RESEND_API_KEY` | [resend.com](https://resend.com) — necessário para e-mails de reset de senha |
| `RESEND_FROM` | Remetente dos e-mails (ex: `BepeAI <noreply@seudominio.com>`) |
| `JWT_EXPIRES_IN` | Validade do token (padrão: `7d`) |
| `LOG_LEVEL` | `info` em produção (padrão já correto) |

> **NUNCA** usar `ADMIN_PASSWORD` em produção — sempre `ADMIN_PASSWORD_HASH`.

### 2.3 Gerar hash da senha admin

```bash
node -e "const b = require('bcryptjs'); b.hash('SUA_SENHA_FORTE', 12).then(h => console.log(h))"
```

### 2.4 Verificar health check

Após o deploy, acessar:
```
GET https://SEU_BACKEND.onrender.com/health
```
Deve retornar `{ "status": "ok", ... }`.

---

## 3. Frontend (Vercel)

### 3.1 Importar projeto no Vercel

- **Framework:** Vite
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

### 3.2 Variáveis de ambiente

| Variável | Valor |
|----------|-------|
| `VITE_API_URL` | URL do backend no Render + `/api` (ex: `https://bepeai-backend.onrender.com/api`) |

---

## 4. Checklist final antes de abrir para usuários

```
BANCO:
[ ] Todas as migrations executadas na ordem correta
[ ] pg_cron habilitado e jobs criados
[ ] Usuário admin criado e testado
[ ] RLS habilitado (verificar no schema.sql)

BACKEND:
[ ] Health check respondendo 200
[ ] Login com admin@bepeai.com funcionando
[ ] Geração de PDF testada
[ ] Upload de arquivo testado

FRONTEND:
[ ] URL da API correta no VITE_API_URL
[ ] Login, chat, PDF e logout testados
[ ] Página /profile acessível

SEGURANÇA:
[ ] JWT_SECRET é um hash aleatório de 64 chars (openssl rand -hex 32)
[ ] ADMIN_PASSWORD_HASH, nunca ADMIN_PASSWORD
[ ] CORS configurado para o domínio real da Vercel
[ ] Nenhuma chave de API exposta no frontend (VITE_ só para URL da API)
```

---

## 5. Usuários e convites

O sistema usa convites para cadastro. Para convidar um novo usuário:

1. Faça login como admin
2. Acesse `/admin`
3. Gere um convite (pode ser vinculado a um e-mail específico)
4. Envie o link de convite para o usuário

Alternativamente, use a API diretamente:
```bash
curl -X POST https://SEU_BACKEND.onrender.com/api/admin/invites \
  -H "Authorization: Bearer SEU_TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"email": "usuario@empresa.com", "note": "Leticia Abreu"}'
```
