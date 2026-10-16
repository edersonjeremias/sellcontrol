// ============================================================================
// Frete público — chamadas da página /frete/:token (cliente sem login)
// ============================================================================
// Nenhuma leitura direta no banco: tudo passa pela Edge Function frete-publico,
// que valida o token e devolve só os dados daquele romaneio.
// ============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

async function chamar(acao, token, payload = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/frete-publico`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ acao, token, ...payload }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Erro ao falar com o servidor')
  return data
}

/** Carrega romaneio, itens, endereços, cotações e pagamento pendente */
export const buscarDados = (token) => chamar('dados', token)

/** Cria ou atualiza o endereço de entrega do cliente */
export const salvarEndereco = (token, endereco, enderecoId = null) =>
  chamar('salvar_endereco', token, { endereco, endereco_id: enderecoId })

/** Cota o frete no Melhor Envio (valores já voltam com a margem da loja) */
export const cotarFrete = (token, enderecoId) =>
  chamar('cotar', token, { endereco_id: enderecoId })

/** Grava a opção escolhida e gera o PIX */
export const gerarPix = (token, cotacaoId) =>
  chamar('pagar', token, { cotacao_id: cotacaoId })

/** Polling enquanto o cliente paga */
export const consultarStatus = (token) => chamar('status', token)

/** Monta o link que a loja manda no WhatsApp */
export const montarLinkFrete = (linkToken) =>
  `${window.location.origin}/frete/${linkToken}`
