-- ================================================================
-- PERCENTUAL DE COMISSAO NO CADASTRO DO FUNCIONARIO
-- O relatorio de comissoes exigia digitar o % linha a linha, e sem
-- percentual nenhuma comissao era calculada. Agora o percentual sai
-- do cadastro e ja vem preenchido na busca.
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE funcionarios
  ADD COLUMN IF NOT EXISTS comissao_percentual NUMERIC(5,2) DEFAULT 0;

COMMENT ON COLUMN funcionarios.comissao_percentual IS
  'Percentual padrao de comissao sobre o liquido vendido, usado no relatorio de comissoes';
