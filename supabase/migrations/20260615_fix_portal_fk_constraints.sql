-- Corrige constraints para permitir UPDATE CASCADE nas foreign keys do portal

-- ═════════════════════════════════════════════════════════════════
-- PORTAL_ITENS_PEDIDO
-- ═════════════════════════════════════════════════════════════════

-- Remove constraint antiga
ALTER TABLE portal_itens_pedido
  DROP CONSTRAINT IF EXISTS portal_itens_pedido_cliente_instagram_fkey;

-- Adiciona constraint com ON UPDATE CASCADE
ALTER TABLE portal_itens_pedido
  ADD CONSTRAINT portal_itens_pedido_cliente_instagram_fkey
  FOREIGN KEY (cliente_instagram)
  REFERENCES portal_clientes(instagram)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════════
-- PORTAL_PEDIDOS
-- ═════════════════════════════════════════════════════════════════

-- Remove constraint antiga
ALTER TABLE portal_pedidos
  DROP CONSTRAINT IF EXISTS portal_pedidos_cliente_instagram_fkey;

-- Adiciona constraint com ON UPDATE CASCADE
ALTER TABLE portal_pedidos
  ADD CONSTRAINT portal_pedidos_cliente_instagram_fkey
  FOREIGN KEY (cliente_instagram)
  REFERENCES portal_clientes(instagram)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════════
-- PORTAL_PRODUCAO
-- ═════════════════════════════════════════════════════════════════

-- Remove constraint antiga
ALTER TABLE portal_producao
  DROP CONSTRAINT IF EXISTS portal_producao_cliente_instagram_fkey;

-- Adiciona constraint com ON UPDATE CASCADE
ALTER TABLE portal_producao
  ADD CONSTRAINT portal_producao_cliente_instagram_fkey
  FOREIGN KEY (cliente_instagram)
  REFERENCES portal_clientes(instagram)
  ON DELETE CASCADE
  ON UPDATE CASCADE;
