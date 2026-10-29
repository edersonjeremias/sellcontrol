-- ============================================================
-- Acesso do cliente do portal aos próprios dados
-- ============================================================
-- As policies de enderecos_clientes, romaneios, cotacoes_frete e
-- pagamentos_frete exigem que auth.uid() esteja em users_perfil — a tabela
-- dos usuários do painel. O cliente do portal não está lá, então toda
-- leitura voltava vazia e o INSERT de endereço falhava com 42501.
--
-- O problema passava despercebido porque, no navegador da loja, a sessão do
-- painel fica ativa e satisfaz a policy. No celular do cliente não há essa
-- sessão.
--
-- Aqui entram policies paralelas, válidas apenas para o cliente do portal e
-- restritas às linhas dele. As policies do painel continuam como estão —
-- policies se somam, nunca se anulam.
-- ============================================================

-- Instagram do cliente logado no portal, normalizado (sem @, minúsculo).
-- Retorna NULL para usuários do painel, o que faz as policies abaixo
-- simplesmente não se aplicarem a eles.
CREATE OR REPLACE FUNCTION portal_slug()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT LOWER(TRIM(REPLACE(instagram, '@', '')))
  FROM portal_clientes
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION portal_slug() TO anon, authenticated;

-- ── Endereços: o cliente gerencia os próprios ──────────────────
DROP POLICY IF EXISTS enderecos_clientes_portal ON enderecos_clientes;
CREATE POLICY enderecos_clientes_portal ON enderecos_clientes
  FOR ALL TO authenticated
  USING      (LOWER(TRIM(REPLACE(cliente_instagram, '@', ''))) = portal_slug())
  WITH CHECK (LOWER(TRIM(REPLACE(cliente_instagram, '@', ''))) = portal_slug());

-- ── Romaneios: lê os próprios e atualiza ao escolher o frete ───
DROP POLICY IF EXISTS romaneios_portal_select ON romaneios;
CREATE POLICY romaneios_portal_select ON romaneios
  FOR SELECT TO authenticated
  USING (LOWER(TRIM(REPLACE(cliente_instagram, '@', ''))) = portal_slug());

DROP POLICY IF EXISTS romaneios_portal_update ON romaneios;
CREATE POLICY romaneios_portal_update ON romaneios
  FOR UPDATE TO authenticated
  USING      (LOWER(TRIM(REPLACE(cliente_instagram, '@', ''))) = portal_slug())
  WITH CHECK (LOWER(TRIM(REPLACE(cliente_instagram, '@', ''))) = portal_slug());

-- ── Peças do romaneio (somente leitura) ────────────────────────
DROP POLICY IF EXISTS vendas_portal_select ON vendas;
CREATE POLICY vendas_portal_select ON vendas
  FOR SELECT TO authenticated
  USING (LOWER(TRIM(REPLACE(COALESCE(cliente_nome, ''), '@', ''))) = portal_slug());

-- ── Cotações e pagamentos: sempre pelo romaneio do cliente ─────
DROP POLICY IF EXISTS cotacoes_frete_portal ON cotacoes_frete;
CREATE POLICY cotacoes_frete_portal ON cotacoes_frete
  FOR ALL TO authenticated
  USING (romaneio_id IN (
    SELECT id FROM romaneios
    WHERE LOWER(TRIM(REPLACE(cliente_instagram, '@', ''))) = portal_slug()
  ))
  WITH CHECK (romaneio_id IN (
    SELECT id FROM romaneios
    WHERE LOWER(TRIM(REPLACE(cliente_instagram, '@', ''))) = portal_slug()
  ));

DROP POLICY IF EXISTS pagamentos_frete_portal ON pagamentos_frete;
CREATE POLICY pagamentos_frete_portal ON pagamentos_frete
  FOR ALL TO authenticated
  USING (romaneio_id IN (
    SELECT id FROM romaneios
    WHERE LOWER(TRIM(REPLACE(cliente_instagram, '@', ''))) = portal_slug()
  ))
  WITH CHECK (romaneio_id IN (
    SELECT id FROM romaneios
    WHERE LOWER(TRIM(REPLACE(cliente_instagram, '@', ''))) = portal_slug()
  ));

NOTIFY pgrst, 'reload schema';
