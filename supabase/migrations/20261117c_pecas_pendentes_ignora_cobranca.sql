-- ============================================================
-- Contagem de peças pendentes: 'ENVIADO' de cobrança não conta como saída
-- ============================================================
-- A tela de Vendas grava 'ENVIADO', em maiúsculas, ao disparar a cobrança
-- da peça; a Expedição grava 'Enviado' junto com a data do despacho. Esta
-- função compara em maiúsculas e sem acento — de propósito, para tolerar
-- os nomes que cada loja cadastra em status_expedicao —, então os dois
-- viravam a mesma coisa e a peça apenas cobrada saía da contagem.
--
-- Nos dados da loja a separação é limpa: as peças com 'ENVIADO' em
-- maiúsculas não têm data_envio nem romaneio, ou seja, nenhuma passou pela
-- expedição. Por isso o valor exato basta para distinguir.
--
-- Mesma regra aplicada no front, em src/lib/statusVenda.js.
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
    AND (
      -- 'ENVIADO' exato = cobrança enviada: a peça continua esperando envio
      TRIM(COALESCE(v.status, '')) = 'ENVIADO'
      OR UPPER(TRANSLATE(
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
    )
    AND TRIM(COALESCE(v.cliente_nome, '')) <> ''
  GROUP BY 1
$$;

GRANT EXECUTE ON FUNCTION producao_pecas_pendentes(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
