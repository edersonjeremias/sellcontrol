-- ============================================================
-- Painel consegue ler e editar o cadastro de portal dos seus clientes
-- ============================================================
-- portal_clientes só tinha policy para o próprio cliente (user_id =
-- auth.uid()). Pelo painel a consulta voltava vazia, então o botão de
-- bloquear o portal nunca aparecia — não havia como saber se o cliente
-- tinha acesso.
--
-- A tabela não tem tenant_id: o vínculo com a loja é o instagram, que
-- também está em clientes. O EXISTS abaixo amarra os dois e garante que
-- cada loja alcance apenas os próprios clientes.
-- ============================================================

-- SECURITY DEFINER para não disparar a RLS da própria tabela e cair em
-- recursão quando usada dentro da policy.
CREATE OR REPLACE FUNCTION is_cliente_portal()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portal_clientes WHERE user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION is_cliente_portal() TO anon, authenticated;

DROP POLICY IF EXISTS portal_clientes_painel ON portal_clientes;
CREATE POLICY portal_clientes_painel ON portal_clientes
  FOR ALL TO authenticated
  USING (
    -- Vale só para quem opera o painel; cliente do portal continua
    -- restrito ao próprio cadastro pela policy que já existia
    NOT is_cliente_portal()
    AND EXISTS (
      SELECT 1
      FROM clientes c
      JOIN users_perfil u ON u.tenant_id = c.tenant_id
      WHERE u.id = auth.uid()
        AND LOWER(TRIM(REPLACE(c.instagram, '@', '')))
          = LOWER(TRIM(REPLACE(portal_clientes.instagram, '@', '')))
    )
  )
  WITH CHECK (
    NOT is_cliente_portal()
    AND EXISTS (
      SELECT 1
      FROM clientes c
      JOIN users_perfil u ON u.tenant_id = c.tenant_id
      WHERE u.id = auth.uid()
        AND LOWER(TRIM(REPLACE(c.instagram, '@', '')))
          = LOWER(TRIM(REPLACE(portal_clientes.instagram, '@', '')))
    )
  );

NOTIFY pgrst, 'reload schema';
