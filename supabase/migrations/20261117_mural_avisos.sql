-- ============================================================================
-- MURAL DE AVISOS — comunicados da empresa na tela inicial
-- ============================================================================
-- Data: 17/11/2026
--
-- Recado para a equipe hoje é grito no grupo do WhatsApp: some na conversa e
-- ninguém sabe quem leu. O mural coloca o comunicado na primeira tela que
-- todo mundo abre (o dashboard), em cards de três colunas, e registra quem
-- abriu e quando — é essa a diferença para a tabela notificacoes, que serve
-- para evento do sistema (peça cancelada) e não para texto escrito à mão.
--
-- Duas tabelas:
--   avisos          — o comunicado (título, corpo em HTML, imagem, validade)
--   avisos_leituras — uma linha por pessoa que abriu o aviso
--
-- Rodar inteiro no SQL Editor do Supabase, de uma vez.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TABELA DOS AVISOS
-- ────────────────────────────────────────────────────────────────────────────
-- corpo guarda HTML: o editor da página permite negrito, cor, lista e imagem
-- no meio do texto. O front sanitiza antes de gravar e antes de exibir.
CREATE TABLE IF NOT EXISTS avisos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  titulo           TEXT NOT NULL,
  corpo            TEXT NOT NULL DEFAULT '',
  imagem_url       TEXT,
  cor              TEXT NOT NULL DEFAULT 'blue',
  fixado           BOOLEAN NOT NULL DEFAULT FALSE,
  abrir_automatico BOOLEAN NOT NULL DEFAULT FALSE,
  ativo            BOOLEAN NOT NULL DEFAULT TRUE,
  inicio_em        DATE,
  fim_em           DATE,
  criado_por       UUID,
  criado_por_nome  TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  avisos                  IS 'Comunicados internos exibidos no mural do dashboard';
COMMENT ON COLUMN avisos.corpo            IS 'HTML sanitizado gerado pelo editor da página Avisos';
COMMENT ON COLUMN avisos.cor              IS 'Faixa lateral do card: blue, green, yellow, red ou purple';
COMMENT ON COLUMN avisos.fixado           IS 'Card fica na frente dos demais no mural';
COMMENT ON COLUMN avisos.abrir_automatico IS 'Abre sozinho em modal para quem ainda não leu';
COMMENT ON COLUMN avisos.inicio_em        IS 'Data a partir da qual aparece (nulo = desde já)';
COMMENT ON COLUMN avisos.fim_em           IS 'Última data em que aparece (nulo = sem prazo)';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. TABELA DE LEITURAS
-- ────────────────────────────────────────────────────────────────────────────
-- tenant_id repetido aqui de propósito: a policy fica uma linha e a contagem
-- de quem leu não precisa de join com avisos.
CREATE TABLE IF NOT EXISTS avisos_leituras (
  aviso_id     UUID NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_nome TEXT NOT NULL DEFAULT '',
  lido_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (aviso_id, user_id)
);

COMMENT ON TABLE avisos_leituras IS 'Quem abriu cada aviso do mural e quando';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ÍNDICES
-- ────────────────────────────────────────────────────────────────────────────
-- O mural do dashboard busca os avisos vigentes do tenant a cada entrada.
CREATE INDEX IF NOT EXISTS idx_avisos_tenant_ativo
  ON avisos (tenant_id, ativo, fixado DESC, created_at DESC);

-- A tela de avisos lê as leituras do tenant inteiro para montar "5 de 8 leram".
CREATE INDEX IF NOT EXISTS idx_avisos_leituras_tenant
  ON avisos_leituras (tenant_id, aviso_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS — cada empresa vê só os próprios avisos
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE avisos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE avisos_leituras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS avisos_tenant_policy ON avisos;
CREATE POLICY avisos_tenant_policy
  ON avisos FOR ALL TO authenticated
  USING      (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()));

DROP POLICY IF EXISTS avisos_leituras_tenant_policy ON avisos_leituras;
CREATE POLICY avisos_leituras_tenant_policy
  ON avisos_leituras FOR ALL TO authenticated
  USING      (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM users_perfil WHERE id = auth.uid()));

-- ────────────────────────────────────────────────────────────────────────────
-- 5. updated_at automático
-- ────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_avisos_updated_at ON avisos;
CREATE TRIGGER update_avisos_updated_at
  BEFORE UPDATE ON avisos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ────────────────────────────────────────────────────────────────────────────
-- 6. PÁGINA NO MENU
-- ────────────────────────────────────────────────────────────────────────────
-- order_index 120: logo depois de Notificações (110), na categoria Principal.
-- O master já enxerga a página assim que ela existe.
INSERT INTO pages (tenant_id, slug, label, icon, category, order_index)
SELECT t.id, 'avisos', 'Mural de Avisos', '📢', 'Principal', 120
  FROM tenants t
 WHERE NOT EXISTS (
   SELECT 1 FROM pages p
    WHERE p.tenant_id = t.id AND p.slug = 'avisos'
 );

-- ────────────────────────────────────────────────────────────────────────────
-- 7. ACESSO: quem administra a empresa pode escrever avisos
-- ────────────────────────────────────────────────────────────────────────────
-- Só admin entra na página de escrita. Ler o mural não depende disso: o
-- dashboard lê a tabela avisos direto, então todo mundo do tenant vê os cards.
INSERT INTO pages_access (tenant_id, user_id, page_id)
SELECT u.tenant_id, u.id, p.id
  FROM users_perfil u
  JOIN pages p ON p.tenant_id = u.tenant_id AND p.slug = 'avisos'
 WHERE u.role = 'admin'
 ON CONFLICT (user_id, page_id) DO NOTHING;

-- ============================================================================
-- CONFERIR (opcional)
-- ============================================================================
-- SELECT a.titulo, a.ativo, a.fixado,
--        (SELECT COUNT(*) FROM avisos_leituras l WHERE l.aviso_id = a.id) AS leram
--   FROM avisos a
--  ORDER BY a.created_at DESC;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
