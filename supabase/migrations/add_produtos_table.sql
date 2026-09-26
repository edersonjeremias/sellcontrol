-- ================================================================
-- TABELA DE PRODUTOS - CADASTRO PERMANENTE
-- ================================================================

-- Tabela de produtos permanentes (não some ao vender)
CREATE TABLE IF NOT EXISTS produtos (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Identificação
  codigo             TEXT NOT NULL DEFAULT '',

  -- Características
  produto            TEXT NOT NULL DEFAULT '',
  modelo             TEXT NOT NULL DEFAULT '',
  cor                TEXT NOT NULL DEFAULT '',
  marca              TEXT NOT NULL DEFAULT '',
  tamanho            TEXT NOT NULL DEFAULT '',
  genero             TEXT NOT NULL DEFAULT '',        -- M/F/U
  condicao           TEXT NOT NULL DEFAULT 'Novo',    -- Novo/Usado

  -- Valores
  custo              NUMERIC(10,2) DEFAULT 0,
  preco              NUMERIC(10,2) NOT NULL DEFAULT 0,
  preco_promocional  NUMERIC(10,2) DEFAULT 0,

  -- Estoque
  quantidade         INTEGER NOT NULL DEFAULT 0,

  -- Controle
  ativo              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Índice único por tenant (código pode repetir entre tenants diferentes)
  UNIQUE(tenant_id, codigo)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_produtos_tenant ON produtos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_produtos_codigo ON produtos(tenant_id, codigo);
CREATE INDEX IF NOT EXISTS idx_produtos_ativo ON produtos(tenant_id, ativo);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_produtos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_produtos_updated_at
  BEFORE UPDATE ON produtos
  FOR EACH ROW
  EXECUTE FUNCTION update_produtos_updated_at();

-- RLS (Row Level Security)
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;

-- Policy: usuários só veem produtos do próprio tenant
CREATE POLICY produtos_tenant_isolation ON produtos
  FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
  ));

-- ================================================================
-- COMENTÁRIOS
-- ================================================================
COMMENT ON TABLE produtos IS 'Cadastro permanente de produtos com controle de estoque';
COMMENT ON COLUMN produtos.codigo IS 'Código único do produto (pode ser manual ou auto-gerado)';
COMMENT ON COLUMN produtos.quantidade IS 'Quantidade em estoque (deduzido ao vender)';
COMMENT ON COLUMN produtos.ativo IS 'Produto ativo (não deletar, só desativar)';
