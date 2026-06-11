-- ================================================================
-- BepeAI — Multi-tenant: configuração por usuário empresarial
-- Executar no Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ================================================================

-- ── 1. Colunas de configuração do tenant na tabela users ──────
-- logo_base64:        logo da empresa em base64 (PNG/JPG, máx ~2MB)
-- brand_color:        cor primária da empresa em hex (ex: '#3D5A80')
-- company_name:       nome exibido no rodapé do PDF
-- template_overrides: mapa de tipo_documento → template_file
--                     ex: {"contrato": "contrato_rs"}

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS logo_base64        TEXT,
  ADD COLUMN IF NOT EXISTS brand_color        TEXT,
  ADD COLUMN IF NOT EXISTS company_name       TEXT,
  ADD COLUMN IF NOT EXISTS template_overrides JSONB NOT NULL DEFAULT '{}';

-- ── 2. Configuração da Leticia Abreu ─────────────────────────
-- Substitua 'EMAIL_DA_LETICIA' pelo e-mail real dela no Supabase Auth.
-- Após rodar, o contrato dela usará o template contrato_rs.txt
-- e a logo estará salva no perfil dela (logo_base64).

-- Passo 2a — Configura nome da empresa (contrato_rs é tipo próprio, não precisa de override):
UPDATE users
SET
  company_name       = 'Leticia Abreu Recrutamento e Seleção',
  template_overrides = '{}'
WHERE email = 'EMAIL_DA_LETICIA';

-- Passo 2b — Para configurar a logo via SQL, converta a imagem para base64
-- e cole aqui. Alternativa: use o endpoint de upload de logo (recomendado).
-- UPDATE users SET logo_base64 = 'data:image/png;base64,...' WHERE email = 'EMAIL_DA_LETICIA';

-- ── 3. Índice para acesso rápido por user_id ──────────────────
-- (opcional, users já tem PK no id, essa coluna é buscada por PK)
-- Nenhum índice adicional necessário — busca sempre por id (PK).

-- ── 4. Verificação ────────────────────────────────────────────
-- Após executar, rode para confirmar:
-- SELECT id, email, company_name, template_overrides FROM users WHERE email = 'EMAIL_DA_LETICIA';
