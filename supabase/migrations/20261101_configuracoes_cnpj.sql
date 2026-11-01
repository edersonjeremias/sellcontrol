-- ================================================================
-- CNPJ DA EMPRESA NAS CONFIGURACOES
-- configuracoes.cpf_cnpj e o documento do remetente (costuma ser o CPF
-- do dono, usado no frete). O recibo precisa do CNPJ da empresa, que
-- ate agora so existia em tenants.cnpj - tabela que apenas o master le.
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE configuracoes
  ADD COLUMN IF NOT EXISTS cnpj TEXT;

-- Traz o CNPJ ja cadastrado na empresa, quando houver
UPDATE configuracoes c
   SET cnpj = t.cnpj
  FROM tenants t
 WHERE t.id = c.tenant_id
   AND c.cnpj IS NULL
   AND t.cnpj IS NOT NULL;

COMMENT ON COLUMN configuracoes.cnpj IS
  'CNPJ da empresa, usado no cabecalho do recibo de pagamento do RH';
