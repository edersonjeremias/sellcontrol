-- ============================================================================
-- LINKS CURTOS PARA WHATSAPP
-- ============================================================================
-- Data: 18/10/2026
--
-- As URLs com UUID (56 caracteres) chegam quebradas em duas linhas no
-- WhatsApp e o aplicativo deixa de reconhecer a URL inteira: só o pedaço
-- final vira link e, clicado, não abre nada. Com um código de 10 caracteres
-- a URL cabe em uma linha só.
--
--   antes:  https://sellcontrol.app/frete/f8b85b16-ba21-4605-94bf-8d9807044060
--   agora:  https://sellcontrol.app/f/3f9c21b8ae
--
-- As rotas antigas (/frete/:token e /recibo/:id) continuam funcionando, então
-- os links já enviados que ainda abrem não quebram.
-- ============================================================================

-- ─── Romaneios (link de frete) ──────────────────────────────────────────────
ALTER TABLE romaneios
  ADD COLUMN IF NOT EXISTS link_codigo TEXT;

UPDATE romaneios
   SET link_codigo = substr(md5(id::text || 'frete'), 1, 10)
 WHERE link_codigo IS NULL;

ALTER TABLE romaneios
  ALTER COLUMN link_codigo SET DEFAULT substr(md5(gen_random_uuid()::text), 1, 10);

CREATE UNIQUE INDEX IF NOT EXISTS idx_romaneios_link_codigo
  ON romaneios(link_codigo);

COMMENT ON COLUMN romaneios.link_codigo IS
  'Código curto do link público de frete: /f/<codigo>';

-- ─── Cobranças (link do recibo) ─────────────────────────────────────────────
ALTER TABLE cobrancas
  ADD COLUMN IF NOT EXISTS link_codigo TEXT;

UPDATE cobrancas
   SET link_codigo = substr(md5(id::text || 'recibo'), 1, 10)
 WHERE link_codigo IS NULL;

ALTER TABLE cobrancas
  ALTER COLUMN link_codigo SET DEFAULT substr(md5(gen_random_uuid()::text), 1, 10);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cobrancas_link_codigo
  ON cobrancas(link_codigo);

COMMENT ON COLUMN cobrancas.link_codigo IS
  'Código curto do recibo público: /r/<codigo>';
