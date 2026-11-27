// ============================================================================
// CATÁLOGO DE MÓDULOS DO SISTEMA — o que cada empresa contrata
// ============================================================================
// O sistema é vendido por assinatura mensal: cada empresa paga pelo que
// habilita. Esta lista é a fonte única da verdade sobre o que existe para
// vender. Quem liga e desliga é o master, em Empresas → Módulos por Empresa.
//
// Dois tipos de módulo:
//   pagina  → tela do sistema, com rota e item de menu (vira linha em `pages`)
//   recurso → não é tela interna: é um canal público da empresa (loja, link
//             da bio, portal, link de frete). Não entra no menu; quem usa é a
//             cliente final, de fora do sistema.
//
// Campos:
//   slug        identificador. Para página, é a rota (/<slug>) e o slug em `pages`
//   label       nome que aparece na tela
//   categoria   agrupamento no menu e na tela do master
//   tipo        'pagina' | 'recurso'
//   preco       mensalidade padrão em reais (negociável por empresa)
//   roles       quem, dentro da empresa, pode abrir (null = qualquer usuário
//               com a página liberada em Usuários e Permissões)
//   essencial   true = vai junto com o sistema, não pode ser desligado
//   descricao   uma linha, para o master saber o que está vendendo
//
// Mexer aqui NÃO cria nada no banco. Para o módulo existir para uma empresa,
// o master precisa habilitá-lo (grava em tenant_modulos e sincroniza `pages`).
// ============================================================================

export const TIPO_PAGINA  = 'pagina'
export const TIPO_RECURSO = 'recurso'

export const MODULOS = [
  // ── Principal ─────────────────────────────────────────────────────────────
  { slug: 'dashboard', label: 'Dashboard', categoria: 'Principal', tipo: TIPO_PAGINA,
    icon: 'dashboard', order_index: 10, preco: 0, roles: null, essencial: true,
    descricao: 'Primeira tela do sistema. Vai junto com a assinatura.' },

  { slug: 'notificacoes', label: 'Notificações', categoria: 'Principal', tipo: TIPO_PAGINA,
    icon: 'notifications', order_index: 15, preco: 29, roles: null, essencial: false,
    descricao: 'Quadro de tarefas e recados entre a equipe.' },

  { slug: 'avisos', label: 'Mural de Avisos', categoria: 'Principal', tipo: TIPO_PAGINA,
    icon: '📢', order_index: 18, preco: 19, roles: ['master', 'admin'], essencial: false,
    descricao: 'Recados da empresa na tela de todo mundo.' },

  // ── Operações ─────────────────────────────────────────────────────────────
  { slug: 'vendas', label: 'Vendas', categoria: 'Operações', tipo: TIPO_PAGINA,
    icon: 'sell', order_index: 20, preco: 149, roles: null, essencial: false,
    descricao: 'Lançamento de venda na live, com sacolinha por cliente.' },

  { slug: 'editar-vendas', label: 'Editar Vendas', categoria: 'Operações', tipo: TIPO_PAGINA,
    icon: 'edit', order_index: 25, preco: 29, roles: null, essencial: false,
    descricao: 'Correção de venda já lançada.' },

  { slug: 'produtos', label: 'Produtos', categoria: 'Operações', tipo: TIPO_PAGINA,
    icon: 'inventory_2', order_index: 28, preco: 79, roles: null, essencial: false,
    descricao: 'Cadastro de peças, estoque, custo e fotos.' },

  { slug: 'producao', label: 'Produção', categoria: 'Operações', tipo: TIPO_PAGINA,
    icon: 'factory', order_index: 30, preco: 59, roles: null, essencial: false,
    descricao: 'Montagem das sacolinhas e controle de quem montou.' },

  { slug: 'expedicao', label: 'Expedição', categoria: 'Operações', tipo: TIPO_PAGINA,
    icon: 'local_shipping', order_index: 35, preco: 59, roles: null, essencial: false,
    descricao: 'Fila de envio, romaneio e status de cada pedido.' },

  { slug: 'compras', label: 'Compras', categoria: 'Operações', tipo: TIPO_PAGINA,
    icon: '🛒', order_index: 36, preco: 49, roles: null, essencial: false,
    descricao: 'Pedidos a fornecedor e entrada de mercadoria.' },

  { slug: 'impressao-sacolinha', label: 'Impressão Sacolinha', categoria: 'Operações', tipo: TIPO_PAGINA,
    icon: 'local_offer', order_index: 40, preco: 19, roles: null, essencial: false,
    descricao: 'Imprime a sacolinha para separar as peças.' },

  { slug: 'impressao-pedidos', label: 'Impressão Pedidos', categoria: 'Operações', tipo: TIPO_PAGINA,
    icon: 'receipt_long', order_index: 45, preco: 19, roles: null, essencial: false,
    descricao: 'Imprime a lista de pedidos do dia.' },

  { slug: 'impressao-sacolinha-cliente', label: 'Impressão Sacol. Cliente', categoria: 'Operações', tipo: TIPO_PAGINA,
    icon: 'shopping_bag', order_index: 50, preco: 19, roles: null, essencial: false,
    descricao: 'Imprime a sacolinha que vai dentro da caixa, para a cliente.' },

  { slug: 'etiquetas', label: 'Etiquetas de Produto', categoria: 'Operações', tipo: TIPO_PAGINA,
    icon: 'label', order_index: 55, preco: 29, roles: null, essencial: false,
    descricao: 'Etiqueta com código e preço para colar na peça.' },

  { slug: 'etiquetas-envio', label: 'Etiquetas de Envio', categoria: 'Operações', tipo: TIPO_PAGINA,
    icon: 'local_shipping', order_index: 56, preco: 49, roles: null, essencial: false,
    descricao: 'Etiqueta dos Correios e transportadoras, com Melhor Envio.' },

  // ── Vendas e clientes ─────────────────────────────────────────────────────
  { slug: 'clientes', label: 'Cadastro de Cliente', categoria: 'Vendas', tipo: TIPO_PAGINA,
    icon: 'people', order_index: 60, preco: 49, roles: null, essencial: false,
    descricao: 'Ficha da cliente, endereço e histórico.' },

  { slug: 'contatos', label: 'CRM — Contatos', categoria: 'Vendas', tipo: TIPO_PAGINA,
    icon: 'forum', order_index: 62, preco: 79, roles: null, essencial: false,
    descricao: 'Conversas com a cliente e acompanhamento de atendimento.' },

  { slug: 'cupons', label: 'Cupons de Desconto', categoria: 'Vendas', tipo: TIPO_PAGINA,
    icon: 'confirmation_number', order_index: 64, preco: 39, roles: ['master', 'admin'], essencial: false,
    descricao: 'Cupons com validade, limite de uso e horário.' },

  { slug: 'fila-espera', label: 'Fila de Espera', categoria: 'Vendas', tipo: TIPO_PAGINA,
    icon: '⏳', order_index: 66, preco: 29, roles: null, essencial: false,
    descricao: 'Quem está esperando peça que faltou.' },

  // ── Financeiro ────────────────────────────────────────────────────────────
  { slug: 'cobrancas', label: 'Cobranças', categoria: 'Financeiro', tipo: TIPO_PAGINA,
    icon: 'payments', order_index: 70, preco: 99, roles: null, essencial: false,
    descricao: 'Cobrança por PIX e cartão, com baixa automática.' },

  { slug: 'relatorio', label: 'Relatório', categoria: 'Financeiro', tipo: TIPO_PAGINA,
    icon: 'bar_chart', order_index: 72, preco: 49, roles: null, essencial: false,
    descricao: 'Fechamento de vendas por período, live e vendedora.' },

  { slug: 'dashboard-financeiro', label: 'Dashboard Financeiro', categoria: 'Financeiro', tipo: TIPO_PAGINA,
    icon: 'insights', order_index: 74, preco: 79, roles: null, essencial: false,
    descricao: 'Faturamento, margem e comparativo de períodos.' },

  { slug: 'contas-pagar', label: 'Contas a Pagar', categoria: 'Financeiro', tipo: TIPO_PAGINA,
    icon: 'receipt', order_index: 76, preco: 49, roles: null, essencial: false,
    descricao: 'Despesas da empresa com vencimento e baixa.' },

  { slug: 'creditos-clientes', label: 'Créditos de Clientes', categoria: 'Financeiro', tipo: TIPO_PAGINA,
    icon: 'loyalty', order_index: 78, preco: 39, roles: null, essencial: false,
    descricao: 'Crédito de devolução e uso em compras futuras.' },

  { slug: 'comissoes', label: 'Comissões', categoria: 'Financeiro', tipo: TIPO_PAGINA,
    icon: 'monetization_on', order_index: 80, preco: 49, roles: null, essencial: false,
    descricao: 'Comissão da equipe de vendas por período.' },

  { slug: 'frete-pagamentos', label: 'Frete e Romaneios', categoria: 'Financeiro', tipo: TIPO_PAGINA,
    icon: '📦', order_index: 82, preco: 59, roles: null, essencial: false,
    descricao: 'Conciliação do frete pago pela cliente e dos romaneios.' },

  // ── Pessoas ───────────────────────────────────────────────────────────────
  { slug: 'rh', label: 'RH', categoria: 'RH', tipo: TIPO_PAGINA,
    icon: '👥', order_index: 90, preco: 89, roles: ['master', 'admin'], essencial: false,
    descricao: 'Funcionários, salário, férias e folha.' },

  { slug: 'ponto', label: 'Bater Ponto', categoria: 'RH', tipo: TIPO_PAGINA,
    icon: '🕐', order_index: 92, preco: 39, roles: null, essencial: false,
    descricao: 'Quiosque de marcação de ponto da equipe.' },

  // ── Admin ─────────────────────────────────────────────────────────────────
  { slug: 'configuracoes', label: 'Configurações', categoria: 'Admin', tipo: TIPO_PAGINA,
    icon: 'settings', order_index: 100, preco: 0, roles: ['master', 'admin'], essencial: true,
    descricao: 'Dados da empresa, usuários e permissões. Vai junto com a assinatura.' },

  { slug: 'painel-loja', label: 'Painel da Loja', categoria: 'Financeiro', tipo: TIPO_PAGINA,
    icon: 'insights', order_index: 120, preco: 49, roles: ['master', 'admin'], essencial: false,
    descricao: 'Visitas, funil e faturamento da loja virtual. Depende do módulo Loja.' },

  // ── Canais públicos (não aparecem no menu) ────────────────────────────────
  { slug: 'loja', label: 'Loja Virtual', categoria: 'Canais', tipo: TIPO_RECURSO,
    icon: 'storefront', order_index: 200, preco: 199, roles: null, essencial: false,
    descricao: 'Vitrine pública /loja/<slug>, com carrinho, PIX e cartão.' },

  { slug: 'bio', label: 'Link da Bio', categoria: 'Canais', tipo: TIPO_RECURSO,
    icon: 'link', order_index: 210, preco: 49, roles: null, essencial: false,
    descricao: 'Página de links /bio/<slug> para a bio do Instagram.' },

  { slug: 'portal', label: 'Portal da Cliente', categoria: 'Canais', tipo: TIPO_RECURSO,
    icon: 'account_circle', order_index: 220, preco: 99, roles: null, essencial: false,
    descricao: 'A cliente abre a própria sacolinha e acompanha o pedido.' },

  { slug: 'frete-link', label: 'Link de Frete', categoria: 'Canais', tipo: TIPO_RECURSO,
    icon: 'local_shipping', order_index: 230, preco: 79, roles: null, essencial: false,
    descricao: 'A cliente escolhe e paga o frete pelo link enviado no WhatsApp.' },

  { slug: 'rastreio', label: 'Rastreio Público', categoria: 'Canais', tipo: TIPO_RECURSO,
    icon: 'travel_explore', order_index: 240, preco: 29, roles: null, essencial: false,
    descricao: 'Página de rastreio do pedido, aberta pela cliente.' },
]

// ── Atalhos de leitura ──────────────────────────────────────────────────────

export const MODULOS_PAGINA = MODULOS.filter(m => m.tipo === TIPO_PAGINA)

const PORSLUG = new Map(MODULOS.map(m => [m.slug, m]))

export const moduloPorSlug = (slug) => PORSLUG.get(slug) || null

/** Slugs que nunca são desligados: a empresa recebe junto com a assinatura. */
export const SLUGS_ESSENCIAIS = MODULOS.filter(m => m.essencial).map(m => m.slug)

/** Páginas do sistema que NÃO são módulo vendável: telas do dono do SaaS. */
export const SLUGS_FORA_DO_CATALOGO = ['master/empresas', 'admin', 'debug']

/** Preço padrão do catálogo. O preço real de cada empresa vem de tenant_modulos. */
export const precoPadrao = (slug) => moduloPorSlug(slug)?.preco ?? 0

/**
 * Agrupa na ordem em que as categorias aparecem na lista — é a ordem em que a
 * tela do master mostra os blocos.
 */
export function modulosPorCategoria(lista = MODULOS) {
  const mapa = new Map()
  for (const m of lista) {
    if (!mapa.has(m.categoria)) mapa.set(m.categoria, [])
    mapa.get(m.categoria).push(m)
  }
  return [...mapa.entries()].map(([categoria, modulos]) => ({ categoria, modulos }))
}

/** Soma da mensalidade: o que está ativo, no preço gravado para a empresa. */
export function somarMensalidade(linhas = []) {
  return (linhas || [])
    .filter(l => l.ativo)
    .reduce((total, l) => total + Number(l.preco_mensal ?? precoPadrao(l.slug) ?? 0), 0)
}

export const formatarReais = (valor) =>
  Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
