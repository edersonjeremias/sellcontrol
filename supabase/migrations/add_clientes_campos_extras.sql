-- Adiciona colunas extras à tabela clientes (se não existirem)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS whatsapp  text    DEFAULT '',
  ADD COLUMN IF NOT EXISTS senha     text    DEFAULT '',
  ADD COLUMN IF NOT EXISTS detalhes  jsonb   DEFAULT '{}';

-- Garante constraint unique (tenant_id, instagram) para upsert funcionar
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clientes_tenant_id_instagram_key'
  ) THEN
    ALTER TABLE clientes ADD CONSTRAINT clientes_tenant_id_instagram_key UNIQUE (tenant_id, instagram);
  END IF;
END $$;
