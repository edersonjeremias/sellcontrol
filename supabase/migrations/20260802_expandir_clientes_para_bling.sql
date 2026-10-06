-- ============================================================================
-- EXPANSÃO DA TABELA CLIENTES PARA SUPORTAR DADOS COMPLETOS DO BLING
-- ============================================================================
-- Data: 02/08/2026
-- Motivo: Importação de clientes do Bling com dados completos
--         (nome, CPF, email, telefone, endereço)
-- ============================================================================

-- Adicionar campos completos do cliente
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nome_completo TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tipo_pessoa TEXT DEFAULT 'fisica'; -- 'fisica' ou 'juridica'

-- Índices para busca
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(tenant_id, nome_completo);
CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(tenant_id, cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes(tenant_id, email);

COMMENT ON COLUMN clientes.nome_completo IS 'Nome completo do cliente (pessoa física) ou Razão Social (pessoa jurídica)';
COMMENT ON COLUMN clientes.cpf_cnpj IS 'CPF ou CNPJ do cliente';
COMMENT ON COLUMN clientes.telefone IS 'Telefone fixo do cliente';
COMMENT ON COLUMN clientes.email IS 'E-mail do cliente';
COMMENT ON COLUMN clientes.tipo_pessoa IS 'Tipo de pessoa: fisica ou juridica';
