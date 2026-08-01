import { supabase } from '../lib/supabase'
import { getConfig } from './configService'

// Cache do token para evitar múltiplas consultas
let tokenCache = {
  tenantId: null,
  token: null,
  apiUrl: null,
  timestamp: 0
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

/**
 * Busca configurações do Melhor Envio do banco de dados
 * @param {string} tenantId - ID do tenant
 * @returns {Promise<{token: string, apiUrl: string}>}
 */
async function getMelhorEnvioConfig(tenantId) {
  // Verifica cache
  const now = Date.now()
  if (tokenCache.tenantId === tenantId &&
      tokenCache.token &&
      (now - tokenCache.timestamp) < CACHE_TTL) {
    return {
      token: tokenCache.token,
      apiUrl: tokenCache.apiUrl
    }
  }

  // Busca do banco
  const config = await getConfig(tenantId)

  if (!config?.token_melhor_envio) {
    throw new Error('Token do Melhor Envio não configurado. Vá em Configurações para adicionar.')
  }

  // Atualiza cache
  tokenCache = {
    tenantId,
    token: config.token_melhor_envio,
    apiUrl: config.melhor_envio_api_url || 'https://sandbox.melhorenvio.com.br',
    timestamp: now
  }

  return {
    token: tokenCache.token,
    apiUrl: tokenCache.apiUrl
  }
}

/**
 * Calcula frete para um romaneio
 * @param {string} tenantId - ID do tenant
 * @param {Object} params - Parâmetros da cotação
 * @param {Object} params.from - Endereço de origem { postal_code, address, number, district, city, state_abbr }
 * @param {Object} params.to - Endereço de destino { postal_code, address, number, district, city, state_abbr }
 * @param {Object} params.package - Dimensões { height, width, length, weight }
 * @returns {Promise<Array>} - Lista de opções de frete
 */
export async function calcularFrete(tenantId, { from, to, package: pkg }) {
  const { token, apiUrl } = await getMelhorEnvioConfig(tenantId)

  const payload = {
    from,
    to,
    package: pkg,
  }

  try {
    const response = await fetch(`${apiUrl}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Erro ao calcular frete')
    }

    const cotacoes = await response.json()
    return cotacoes
  } catch (err) {
    console.error('Erro ao calcular frete:', err)
    throw err
  }
}

/**
 * Salva cotações de frete no banco
 * @param {string} romaneioId - ID do romaneio
 * @param {Array} cotacoes - Lista de cotações do Melhor Envio
 */
export async function salvarCotacoes(romaneioId, cotacoes) {
  const registros = cotacoes.map(c => ({
    romaneio_id: romaneioId,
    transportadora: c.company?.name || c.name,
    servico: c.name,
    valor: c.price || c.custom_price,
    prazo: c.delivery_time,
    melhor_envio_data: c,
  }))

  const { error } = await supabase
    .from('cotacoes_frete')
    .insert(registros)

  if (error) throw error
}

/**
 * Busca cotações salvas de um romaneio
 * @param {string} romaneioId - ID do romaneio
 * @returns {Promise<Array>} - Lista de cotações
 */
export async function buscarCotacoes(romaneioId) {
  const { data, error } = await supabase
    .from('cotacoes_frete')
    .select('*')
    .eq('romaneio_id', romaneioId)
    .order('valor', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Compra uma etiqueta de envio
 * @param {string} tenantId - ID do tenant
 * @param {string} serviceId - ID do serviço escolhido (da cotação)
 * @param {Object} orderData - Dados completos do pedido
 * @returns {Promise<Object>} - Dados do pedido criado
 */
export async function comprarEtiqueta(tenantId, serviceId, orderData) {
  const { token, apiUrl } = await getMelhorEnvioConfig(tenantId)

  try {
    const response = await fetch(`${apiUrl}/api/v2/me/cart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        service: serviceId,
        ...orderData,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Erro ao adicionar ao carrinho')
    }

    const cart = await response.json()

    const checkoutResponse = await fetch(`${apiUrl}/api/v2/me/shipment/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        orders: [cart.id],
      }),
    })

    if (!checkoutResponse.ok) {
      const error = await checkoutResponse.json()
      throw new Error(error.message || 'Erro ao finalizar compra')
    }

    return await checkoutResponse.json()
  } catch (err) {
    console.error('Erro ao comprar etiqueta:', err)
    throw err
  }
}

/**
 * Gera etiqueta de envio (após pagamento confirmado)
 * @param {string} tenantId - ID do tenant
 * @param {Array} orderIds - IDs dos pedidos
 * @returns {Promise<Object>} - URL da etiqueta gerada
 */
export async function gerarEtiqueta(tenantId, orderIds) {
  const { token, apiUrl } = await getMelhorEnvioConfig(tenantId)

  try {
    const response = await fetch(`${apiUrl}/api/v2/me/shipment/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        orders: orderIds,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Erro ao gerar etiqueta')
    }

    return await response.json()
  } catch (err) {
    console.error('Erro ao gerar etiqueta:', err)
    throw err
  }
}

/**
 * Imprime etiqueta (retorna URL do PDF)
 * @param {string} tenantId - ID do tenant
 * @param {Array} orderIds - IDs dos pedidos
 * @returns {Promise<string>} - URL do PDF da etiqueta
 */
export async function imprimirEtiqueta(tenantId, orderIds) {
  const { token, apiUrl } = await getMelhorEnvioConfig(tenantId)

  try {
    const response = await fetch(`${apiUrl}/api/v2/me/shipment/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        orders: orderIds,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Erro ao imprimir etiqueta')
    }

    const result = await response.json()
    return result.url
  } catch (err) {
    console.error('Erro ao imprimir etiqueta:', err)
    throw err
  }
}

/**
 * Rastreia um envio
 * @param {string} tenantId - ID do tenant
 * @param {string} trackingCode - Código de rastreio
 * @returns {Promise<Object>} - Dados do rastreamento
 */
export async function rastrearEnvio(tenantId, trackingCode) {
  const { token, apiUrl } = await getMelhorEnvioConfig(tenantId)

  try {
    const response = await fetch(`${apiUrl}/api/v2/me/shipment/tracking?orders=${trackingCode}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Erro ao rastrear envio')
    }

    return await response.json()
  } catch (err) {
    console.error('Erro ao rastrear envio:', err)
    throw err
  }
}

/**
 * Atualiza romaneio com dados da cotação escolhida
 * @param {string} romaneioId - ID do romaneio
 * @param {Object} cotacao - Cotação escolhida
 */
export async function atualizarRomaneioComFrete(romaneioId, cotacao) {
  const { error } = await supabase
    .from('romaneios')
    .update({
      transportadora: cotacao.transportadora,
      servico: cotacao.servico,
      valor_frete: cotacao.valor,
      prazo_entrega: cotacao.prazo,
      status: 'frete_cotado',
    })
    .eq('id', romaneioId)

  if (error) throw error
}

/**
 * Marca frete como pago
 * @param {string} romaneioId - ID do romaneio
 * @param {Object} dadosPagamento - Dados do pagamento (transaction_id, etc)
 */
export async function marcarFretePago(romaneioId, dadosPagamento = {}) {
  const { error } = await supabase
    .from('romaneios')
    .update({
      status: 'frete_pago',
      frete_pago_em: new Date().toISOString(),
    })
    .eq('id', romaneioId)

  if (error) throw error

  if (Object.keys(dadosPagamento).length > 0) {
    const { error: pagError } = await supabase
      .from('pagamentos_frete')
      .update({
        status: 'aprovado',
        pago_em: new Date().toISOString(),
        ...dadosPagamento,
      })
      .eq('romaneio_id', romaneioId)
      .eq('status', 'pendente')

    if (pagError) console.warn('Erro ao atualizar pagamento:', pagError)
  }
}
