-- Criar tabela para salvar configurações de layout de etiquetas
CREATE TABLE IF NOT EXISTS config_etiquetas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  layout JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id)
);

-- Criar índice para busca rápida por tenant
CREATE INDEX IF NOT EXISTS idx_config_etiquetas_tenant_id ON config_etiquetas(tenant_id);

-- Habilitar RLS
ALTER TABLE config_etiquetas ENABLE ROW LEVEL SECURITY;

-- Policy: usuários podem ver apenas configurações do seu tenant
CREATE POLICY "Usuários podem ver config de etiquetas do seu tenant"
  ON config_etiquetas FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
  ));

-- Policy: usuários podem inserir config para seu tenant
CREATE POLICY "Usuários podem inserir config de etiquetas do seu tenant"
  ON config_etiquetas FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
  ));

-- Policy: usuários podem atualizar config do seu tenant
CREATE POLICY "Usuários podem atualizar config de etiquetas do seu tenant"
  ON config_etiquetas FOR UPDATE
  USING (tenant_id IN (
    SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
  ));
