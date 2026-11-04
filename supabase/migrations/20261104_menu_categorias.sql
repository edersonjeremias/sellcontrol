-- ════════════════════════════════════════════════════════════════════
-- MENU CONFIGURÁVEL: categoria e ordem passam a vir do banco
-- ════════════════════════════════════════════════════════════════════
--
-- Até aqui o menu lateral era montado por duas constantes fixas no
-- código (SLUG_TO_CATEGORY e CATEGORY_ORDER em AppShell.jsx), e as
-- colunas pages.category / pages.order_index eram ignoradas.
--
-- Esta migration copia aquele agrupamento fixo para o banco, para o
-- menu continuar exatamente igual depois da troca. A partir daí, a
-- organização é editável em Configurações → Menu.
--
-- ════════════════════════════════════════════════════════════════════

-- 1) Categoria e ordem iguais às que estavam no código
UPDATE pages p
SET category    = m.categoria,
    order_index = m.ordem
FROM (VALUES
  ('dashboard',                   'Principal',  100),
  ('notificacoes',                'Principal',  110),

  ('vendas',                      'Vendas',     200),
  ('editar-vendas',               'Vendas',     210),
  ('cupons',                      'Vendas',     220),
  ('contatos',                    'Vendas',     230),

  ('cobrancas',                   'Financeiro', 300),
  ('relatorio',                   'Financeiro', 310),
  ('dashboard-financeiro',        'Financeiro', 320),
  ('contas-pagar',                'Financeiro', 330),
  ('creditos-clientes',           'Financeiro', 340),
  ('frete-pagamentos',            'Financeiro', 350),
  ('compras',                     'Financeiro', 360),
  ('comissoes',                   'Financeiro', 370),

  ('producao',                    'Produção',   400),
  ('expedicao',                   'Produção',   410),

  ('impressao-pedidos',           'Impressão',  500),
  ('impressao-sacolinha',         'Impressão',  510),
  ('impressao-sacolinha-cliente', 'Impressão',  520),
  ('etiquetas',                   'Impressão',  530),

  ('produtos',                    'Cadastro',   600),
  ('clientes',                    'Cadastro',   610),

  ('rh',                          'RH',         700),
  ('ponto',                       'RH',         710),

  ('configuracoes',               'Admin',      800)
) AS m(slug, categoria, ordem)
WHERE p.slug = m.slug;

-- 2) O que não estava no mapa caía em "Outros" no menu antigo.
--    Mantém esse comportamento e joga para o fim da lista.
WITH restantes AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY label, slug) AS n
  FROM pages
  WHERE slug NOT IN (
    'dashboard','notificacoes','vendas','editar-vendas','cupons','contatos',
    'cobrancas','relatorio','dashboard-financeiro','contas-pagar',
    'creditos-clientes','frete-pagamentos','compras','comissoes',
    'producao','expedicao','impressao-pedidos','impressao-sacolinha',
    'impressao-sacolinha-cliente','etiquetas','produtos','clientes',
    'rh','ponto','configuracoes'
  )
)
UPDATE pages p
SET category    = 'Outros',
    order_index = 900 + (r.n * 10)
FROM restantes r
WHERE p.id = r.id;

-- 3) Rede de segurança: nenhuma página pode ficar sem categoria
UPDATE pages
SET category = 'Outros'
WHERE category IS NULL OR btrim(category) = '';

-- 4) Conferência: é isto que vai virar o menu
SELECT category, order_index, slug, label
FROM pages
WHERE tenant_id = (SELECT tenant_id FROM users_perfil WHERE role = 'master' LIMIT 1)
ORDER BY order_index;
