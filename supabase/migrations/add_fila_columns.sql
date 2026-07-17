-- Adiciona colunas de fila de clientes na tabela vendas
-- Permite até 3 clientes na fila de espera por produto

ALTER TABLE vendas
ADD COLUMN IF NOT EXISTS fila1 text,
ADD COLUMN IF NOT EXISTS fila2 text,
ADD COLUMN IF NOT EXISTS fila3 text;

COMMENT ON COLUMN vendas.fila1 IS 'Primeiro cliente na fila de espera';
COMMENT ON COLUMN vendas.fila2 IS 'Segundo cliente na fila de espera';
COMMENT ON COLUMN vendas.fila3 IS 'Terceiro cliente na fila de espera';
