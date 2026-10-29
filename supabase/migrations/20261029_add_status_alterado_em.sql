-- Registra quando o status de cada item foi alterado pela última vez
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS status_alterado_em TIMESTAMPTZ;

-- Itens que já possuem status recebem o updated_at como aproximação inicial
UPDATE vendas
SET status_alterado_em = updated_at
WHERE status IS NOT NULL
  AND status <> ''
  AND status_alterado_em IS NULL;
