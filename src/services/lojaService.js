// ============================================================================
// Loja pública — chamadas da página /loja/:slug (cliente sem login)
// ============================================================================
// Nenhuma leitura direta no banco: tudo passa pela Edge Function loja-publica,
// que resolve a loja pelo slug e devolve só o que a vitrine mostra. O cadastro
// de produtos guarda custo e estoque, que não saem de lá.
// ============================================================================

import { siteUrl } from '../lib/siteUrl'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

async function chamar(acao, slug, payload = {}) {
  const resposta = await fetch(`${SUPABASE_URL}/functions/v1/loja-publica`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ acao, slug, ...payload }),
  })

  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok) {
    const erro = new Error(dados.error || 'Erro ao falar com a loja')
    erro.status = resposta.status
    erro.dados = dados
    throw erro
  }
  return dados
}

/**
 * Vitrine: peças disponíveis, opções de filtro e paginação.
 *
 * O pedidoId vai junto para a peça que a própria cliente guardou continuar
 * aparecendo para ela — a reserva esconde a peça das outras, não dela.
 */
export const buscarCatalogo = (slug, { pagina = 1, filtros = {}, busca = '', pedidoId = null } = {}) =>
  chamar('catalogo', slug, { pagina, filtros, busca, pedido_id: pedidoId })

/** Página de uma peça só, a que é divulgada no Instagram */
export const buscarPeca = (slug, codigo, pedidoId = null) =>
  chamar('peca', slug, { codigo, pedido_id: pedidoId })

/** Guarda a peça no carrinho. Sem pedido_id, a função abre um carrinho novo. */
export const reservarPeca = (slug, produtoId, pedidoId) =>
  chamar('reservar', slug, { produto_id: produtoId, pedido_id: pedidoId })

/** O que está no carrinho e quanto tempo falta */
export const buscarCarrinho = (slug, pedidoId) =>
  chamar('carrinho', slug, { pedido_id: pedidoId })

/** Devolve a peça ao catálogo na hora */
export const liberarPeca = (slug, produtoId, pedidoId) =>
  chamar('liberar', slug, { produto_id: produtoId, pedido_id: pedidoId })

/** Link da loja e da peça, para divulgar */
export const linkLoja = (slug) => siteUrl(`/loja/${slug}`)
export const linkPeca = (slug, codigo) => siteUrl(`/loja/${slug}/p/${encodeURIComponent(codigo)}`)
