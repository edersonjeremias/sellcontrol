-- ================================================================
-- COMPROVANTES DE PAGAMENTO NOS LANCAMENTOS DO RH
-- Coluna com os caminhos dos arquivos + bucket privado no Storage.
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

-- ── 1. Coluna com os caminhos dos arquivos (ate 3) ─────────────
ALTER TABLE rh_lancamentos
  ADD COLUMN IF NOT EXISTS comprovantes JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN rh_lancamentos.comprovantes IS
  'Caminhos dos comprovantes no bucket rh-comprovantes (maximo 3). Ex: ["tenant/lanc/123.jpg"]';

-- ── 2. Bucket PRIVADO ──────────────────────────────────────────
-- Recibo do banco e recibo assinado trazem nome, valor e assinatura:
-- o bucket nao e publico e a tela exibe por URL assinada temporaria.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rh-comprovantes', 'rh-comprovantes', FALSE, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public             = FALSE,
      file_size_limit    = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- ── 3. Acesso restrito ao tenant do usuario ────────────────────
-- A primeira pasta do caminho e o tenant_id (tenant/lancamento/arquivo).
DROP POLICY IF EXISTS "rh_comprovantes_select" ON storage.objects;
DROP POLICY IF EXISTS "rh_comprovantes_insert" ON storage.objects;
DROP POLICY IF EXISTS "rh_comprovantes_update" ON storage.objects;
DROP POLICY IF EXISTS "rh_comprovantes_delete" ON storage.objects;

CREATE POLICY "rh_comprovantes_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'rh-comprovantes'
    AND (
      (storage.foldername(name))[1] = public.get_tenant_id()::text
      OR public.get_user_role() = 'master'
    )
  );

CREATE POLICY "rh_comprovantes_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rh-comprovantes'
    AND (
      (storage.foldername(name))[1] = public.get_tenant_id()::text
      OR public.get_user_role() = 'master'
    )
  );

CREATE POLICY "rh_comprovantes_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'rh-comprovantes'
    AND (
      (storage.foldername(name))[1] = public.get_tenant_id()::text
      OR public.get_user_role() = 'master'
    )
  );

CREATE POLICY "rh_comprovantes_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'rh-comprovantes'
    AND (
      (storage.foldername(name))[1] = public.get_tenant_id()::text
      OR public.get_user_role() = 'master'
    )
  );
