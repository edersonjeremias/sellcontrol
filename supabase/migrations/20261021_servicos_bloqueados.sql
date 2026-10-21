-- ============================================================================
-- SERVIÇOS DE FRETE OCULTOS NA COTAÇÃO
-- ============================================================================
-- Data: 21/10/2026
--
-- O filtro de transportadoras é por empresa (Correios, Jadlog), mas algumas
-- modalidades não servem para a loja — o Jadlog .Package Centralizado, por
-- exemplo, exige levar o volume até uma unidade centralizadora. Aqui ficam
-- os termos que removem o serviço da lista que o cliente enxerga.
-- ============================================================================

ALTER TABLE configuracoes
  ADD COLUMN IF NOT EXISTS servicos_bloqueados TEXT[] DEFAULT '{}';

COMMENT ON COLUMN configuracoes.servicos_bloqueados IS
  'Termos que ocultam serviços na cotação: o nome do serviço que contiver o termo não é oferecido';

-- Oculta o Centralizado para quem já está usando o frete hoje
UPDATE configuracoes
   SET servicos_bloqueados = ARRAY['Centralizado']
 WHERE token_melhor_envio IS NOT NULL
   AND (servicos_bloqueados IS NULL OR servicos_bloqueados = '{}');
