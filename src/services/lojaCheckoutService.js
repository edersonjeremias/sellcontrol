// ============================================================================
// Checkout da loja — dados, frete e pagamento
// ============================================================================
// Separado da vitrine porque aqui se mexe em dinheiro: o navegador manda só a
// escolha da cliente (qual frete, qual forma de pagamento). Valor do frete e
// total são sempre recalculados no servidor.
// ============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

async function chamar(funcao, corpo) {
  const resposta = await fetch(`${SUPABASE_URL}/functions/v1/${funcao}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(corpo),
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

const checkout = (acao, pedidoId, payload = {}) =>
  chamar('loja-checkout', { acao, pedido_id: pedidoId, ...payload })

/** Pedido inteiro: itens, dados, cotações, frete escolhido e pagamento */
export const buscarPedido = (pedidoId) => checkout('pedido', pedidoId)

/** Grava quem compra e para onde vai. Trocar o CEP derruba a cotação antiga. */
export const identificar = (pedidoId, cliente, endereco) =>
  checkout('identificar', pedidoId, { cliente, endereco })

/** Cota no Melhor Envio, com a caixa escolhida pelo peso das peças */
export const cotarFrete = (pedidoId) => checkout('cotar', pedidoId)

/** Gera o PIX ou abre o cartão. `forma` é 'pix' ou 'cartao'. */
export const pagar = (pedidoId, cotacaoId, forma) =>
  checkout('pagar', pedidoId, { cotacao_id: cotacaoId, forma })

/**
 * Pergunta ao Mercado Pago se o pagamento entrou e, se entrou, vira o pedido
 * em venda, romaneio e peça na Produção.
 *
 * A página chama isso enquanto a cliente espera. O webhook faz o mesmo quando
 * o Mercado Pago avisa; os dois caminhos convivem porque a confirmação é
 * idempotente, e assim a cliente não fica dependendo do webhook chegar.
 */
export const confirmarPedido = (pedidoId) =>
  chamar('loja-confirmar-pedido', { pedido_id: pedidoId })

/** Endereço pelo CEP, como o resto do sistema já faz */
export async function buscarCep(cep) {
  const limpo = String(cep || '').replace(/\D/g, '')
  if (limpo.length !== 8) return null

  const resposta = await fetch(`https://viacep.com.br/ws/${limpo}/json/`)
  const dados = await resposta.json()
  if (dados.erro) return null

  return {
    rua: dados.logradouro || '',
    bairro: dados.bairro || '',
    cidade: dados.localidade || '',
    estado: dados.uf || '',
  }
}
