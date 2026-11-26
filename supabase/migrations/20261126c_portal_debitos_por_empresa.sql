-- ============================================================================
-- PORTAL — DÉBITOS DA CLIENTE, SÓ DA EMPRESA DELA
-- ============================================================================
-- Continuação de 20261126b_portal_por_empresa.sql, que precisa ter rodado
-- antes (é de lá que vem portal_get_tenant()).
--
-- portal_get_meus_debitos existia só dentro do banco, sem código no
-- repositório, e buscava em `cobrancas` apenas pelo @ da cliente. Com mais de
-- uma empresa no sistema, a @maria logada no portal de uma loja via também as
-- cobranças que a @maria de outra loja tem lá.
--
-- Esta migration faz duas coisas: traz a função para o repositório, como ela
-- está hoje, e acrescenta o filtro por empresa. Nada mais mudou — mesmos
-- campos, mesma ordem, mesmos status.
--
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.portal_get_meus_debitos()
RETURNS TABLE(
  id         uuid,
  data       date,
  total      numeric,
  status     text,
  link_mp    text,
  observacao text,
  live       text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_instagram TEXT;
  v_slug      TEXT;
  v_tenant    UUID;
BEGIN
  v_instagram := portal_get_instagram();
  IF v_instagram IS NULL THEN RETURN; END IF;

  -- A empresa da conta logada. Sem ela não devolvemos nada: tela vazia é
  -- melhor que tela com a cobrança de uma cliente de outra loja.
  v_tenant := portal_get_tenant();
  IF v_tenant IS NULL THEN RETURN; END IF;

  v_slug := LOWER(TRIM(REPLACE(v_instagram, '@', '')));

  RETURN QUERY
  SELECT
    c.id,
    c.data::DATE,
    c.total::NUMERIC,
    c.status::TEXT,
    COALESCE(c.link_mp, '')::TEXT,
    COALESCE(c.observacao, '')::TEXT,
    COALESCE(c.live, '')::TEXT
  FROM cobrancas c
  WHERE c.tenant_id = v_tenant
    AND LOWER(TRIM(REPLACE(COALESCE(c.cliente, ''), '@', ''))) = v_slug
    AND c.status IN ('PENDENTE', 'ENVIADO', 'REENVIADO', 'LEMBRETE')
  ORDER BY c.data DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.portal_get_meus_debitos() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
