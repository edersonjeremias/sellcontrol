-- ============================================================
-- Bloqueio de acesso ao portal, por cliente
-- ============================================================
-- Independente de clientes.bloqueado, que vale só para as vendas: a loja
-- pode querer barrar novas compras e ainda assim deixar o cliente entrar
-- para quitar um frete, ou o contrário.
--
-- Além da checagem na tela, portal_get_instagram() passa a devolver NULL
-- para quem está bloqueado. Como as RPCs e as policies do portal partem
-- dessa função, o bloqueio vale no banco mesmo que alguém tente burlar a
-- interface.
-- ============================================================

ALTER TABLE portal_clientes
ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN portal_clientes.bloqueado IS
  'Impede o cliente de usar o portal. Não afeta o bloqueio de vendas em clientes.bloqueado';

CREATE OR REPLACE FUNCTION portal_get_instagram()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT instagram
  FROM portal_clientes
  WHERE user_id = auth.uid()
    AND bloqueado = false
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION portal_slug()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT LOWER(TRIM(REPLACE(instagram, '@', '')))
  FROM portal_clientes
  WHERE user_id = auth.uid()
    AND bloqueado = false
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION portal_get_instagram() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_slug() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
