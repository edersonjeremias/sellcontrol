-- ============================================================
-- PRODUÇÃO: peças com crédito gerado saem da contagem
--
-- A coluna PEÇAS contava tudo o que não estava 'Enviado', 'Cancelado',
-- 'Devolução' ou 'Gerar Crédito'. Só que cada loja cadastra os próprios
-- status em status_expedicao, e 'Crédito gerado' (o estado final, depois
-- que o crédito já saiu) não estava na lista: a peça não vai ser enviada
-- e mesmo assim entrava na conta e na lista que a seta abre.
--
-- Agora a comparação é feita em maiúsculas e sem acento, para pegar as
-- variantes de escrita sem depender de como cada loja digitou o status.
--
-- Cole e execute no SQL Editor do Supabase.
-- ============================================================

CREATE OR REPLACE FUNCTION producao_pecas_pendentes(p_tenant_id UUID)
RETURNS TABLE (cliente_slug TEXT, pecas BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    LOWER(TRIM(REPLACE(COALESCE(v.cliente_nome, ''), '@', ''))) AS cliente_slug,
    COUNT(*)                                                    AS pecas
  FROM vendas v
  WHERE v.tenant_id = p_tenant_id
    AND COALESCE(v.etapa, '') <> 'rascunho'
    AND UPPER(TRANSLATE(
          TRIM(COALESCE(v.status, '')),
          'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
        )) NOT IN (
          'ENVIADO',
          'CANCELADO',
          'DEVOLUCAO',
          'GERAR CREDITO',
          'CREDITO GERADO'
        )
    AND TRIM(COALESCE(v.cliente_nome, '')) <> ''
  GROUP BY 1
$$;

GRANT EXECUTE ON FUNCTION producao_pecas_pendentes(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
