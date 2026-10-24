-- ============================================================================
-- AUDITORIA DA BAIXA MANUAL DE FRETE
-- ============================================================================
-- Data: 23/10/2026
--
-- O botão "Marcar como Pago" tentava gravar em pagamentos_frete com
-- metodo = 'manual', uma coluna observacao e um tenant_id. Nada disso existia:
-- o CHECK de metodo só aceitava pix, cartao e boleto. O insert falhava, mas o
-- romaneio já tinha sido marcado como frete_pago na linha anterior — então a
-- baixa manual acontecia sem deixar nenhum rastro, e o frete aparecia pago sem
-- pagamento correspondente no Mercado Pago.
-- ============================================================================

-- Passa a aceitar os métodos usados na baixa manual
ALTER TABLE pagamentos_frete
  DROP CONSTRAINT IF EXISTS pagamentos_frete_metodo_check;

ALTER TABLE pagamentos_frete
  ADD CONSTRAINT pagamentos_frete_metodo_check
  CHECK (metodo IN ('pix', 'cartao', 'boleto', 'manual', 'credito', 'cortesia'));

-- Quem deu a baixa e por quê
ALTER TABLE pagamentos_frete
  ADD COLUMN IF NOT EXISTS observacao TEXT,
  ADD COLUMN IF NOT EXISTS registrado_por UUID,
  ADD COLUMN IF NOT EXISTS registrado_por_nome TEXT;

COMMENT ON COLUMN pagamentos_frete.observacao IS
  'Motivo informado na baixa manual (crédito, cortesia, pagamento externo)';
COMMENT ON COLUMN pagamentos_frete.registrado_por IS
  'Usuário que deu a baixa manual (users_perfil.id)';
COMMENT ON COLUMN pagamentos_frete.registrado_por_nome IS
  'Nome do usuário na hora da baixa, preservado mesmo se o cadastro mudar';
