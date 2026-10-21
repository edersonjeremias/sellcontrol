-- ============================================================
-- PRODUÇÃO: contagem de peças pendentes por cliente
--
-- Alimenta a coluna PEÇAS da tela de Produção. A agregação roda no
-- banco porque contar no navegador exigia baixar todas as vendas em
-- aberto do tenant — o PostgREST cortava o resultado e a contagem saía
-- por baixo, sem avisar.
--
-- Regra = a mesma do filtro "não enviados" da Expedição:
--   · 'rascunho' é live em digitação, não conta
--   · 'ENVIADO' (caixa alta) é o aviãozinho liberando a peça na live —
--     ela continua na sacolinha; só 'Enviado', da Expedição, é despacho
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
    AND COALESCE(v.etapa, '')  <> 'rascunho'
    AND COALESCE(v.status, '') NOT IN ('Enviado', 'Cancelado', 'Devolução', 'Gerar Crédito')
    AND UPPER(COALESCE(v.status, '')) <> 'CANCELADO'
    AND TRIM(COALESCE(v.cliente_nome, '')) <> ''
  GROUP BY 1
$$;

GRANT EXECUTE ON FUNCTION producao_pecas_pendentes(UUID) TO authenticated;

-- Deixa a agregação barata: filtra tenant + etapa e já entrega o cliente
CREATE INDEX IF NOT EXISTS idx_vendas_pecas_pendentes
  ON vendas (tenant_id, etapa, cliente_nome);
