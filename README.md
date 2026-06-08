# BepeAI — Automação Documental Inteligente

Chat conversacional que coleta dados via IA e gera PDFs profissionais (contratos, propostas, relatórios, orçamentos).

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js 22 + Express + TypeScript |
| IA | Groq API (llama-3.3-70b-versatile) |
| Banco | Supabase (PostgreSQL) |
| PDF | pdf-lib |

---

## Pré-requisitos

- Node.js >= 20
- Conta [Groq](https://console.groq.com) (gratuita) — para a `GROQ_API_KEY`
- Projeto no [Supabase](https://supabase.com) — para banco e sessões

---

## Instalação

### 1. Clone e instale dependências

```bash
git clone <url-do-repo>
cd bepeai

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Configure as variáveis de ambiente

```bash
# Backend
cp backend/.env.example backend/.env
# Edite backend/.env com seus valores

# Frontend
cp frontend/.env.example frontend/.env
# Edite frontend/.env com a URL do backend
```

### 3. Execute a migration SQL no Supabase

No **SQL Editor** do seu projeto Supabase, execute:

```sql
-- Sessões de workflow (estado da conversa ativa)
CREATE TABLE IF NOT EXISTS workflow_sessions (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversas (histórico)
CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  workflow_type TEXT,
  status        TEXT NOT NULL DEFAULT 'in_progress',
  title         TEXT,
  final_data    JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conv_user_updated
  ON conversations (user_id, updated_at DESC);

-- Turns de cada conversa
CREATE TABLE IF NOT EXISTS conversation_turns (
  id               BIGSERIAL PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  turn_number      INT NOT NULL,
  user_message     TEXT NOT NULL,
  ai_response      TEXT NOT NULL,
  group_id         TEXT,
  extracted_fields JSONB,
  saved_fields     TEXT[],
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_turns_conv
  ON conversation_turns (conversation_id, turn_number ASC);

-- Documentos gerados
CREATE TABLE IF NOT EXISTS generated_documents (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  document_type   TEXT NOT NULL,
  field_data      JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Desabilitar RLS nas tabelas do backend (usa service_role key)
ALTER TABLE workflow_sessions    DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversations        DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_turns   DISABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents  DISABLE ROW LEVEL SECURITY;
```

### 4. Rode em desenvolvimento

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Acesse: http://localhost:5173

---

## Variáveis de ambiente obrigatórias

### Backend (`backend/.env`)

| Variável | Descrição |
|----------|-----------|
| `PORT` | Porta do servidor (padrão: `3001`) |
| `JWT_SECRET` | Segredo JWT — gere com `openssl rand -hex 32` |
| `GROQ_API_KEY` | Chave da API Groq |
| `ADMIN_EMAIL` | E-mail do usuário administrador |
| `ADMIN_PASSWORD` | Senha (dev) — ou use `ADMIN_PASSWORD_HASH` (produção) |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role (nunca expor no frontend) |
| `ALLOWED_ORIGINS` | Origins permitidas pelo CORS (ex: `http://localhost:5173`) |

### Frontend (`frontend/.env`)

| Variável | Descrição |
|----------|-----------|
| `VITE_API_URL` | URL base do backend (ex: `http://localhost:3001/api`) |

---

## Build para produção

```bash
# Backend
cd backend && npm run build
node dist/server.js

# Frontend
cd frontend && npm run build
# Sirva a pasta dist/ com nginx, Vercel, Netlify etc.
```

---

## Estrutura do projeto

```
bepeai/
├── backend/
│   ├── src/
│   │   ├── controllers/     # Handlers HTTP
│   │   ├── services/        # Lógica de negócio e IA
│   │   ├── routes/          # Definição de rotas
│   │   ├── middlewares/     # Auth, error handler
│   │   ├── lib/             # Supabase, logger, env, session store
│   │   ├── workflows/       # Definições de formulários conversacionais
│   │   └── templates/       # Templates .txt dos documentos
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── pages/           # Login, ChatBot
    │   ├── components/      # UI e chat
    │   ├── hooks/           # useChat, useHistory
    │   └── services/        # API clients
    └── .env.example
```
