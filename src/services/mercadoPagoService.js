import { supabase } from '../lib/supabase'
import { getConfig } from './configService'

const MERCADO_PAGO_API_URL = 'https://api.mercadopago.com'

// Cache do token para evitar múltiplas consultas
let mpTokenCache = {
  tenantId: null,
  token: null,
  timestamp: 0
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

/**
 * Busca token do Mercado Pago do banco de dados
 * @param {string} tenantId - ID do tenant
 * @returns {Promise<string>}
 */
async function getMercadoPagoToken(tenantId) {
  // Verifica cache
  const now = Date.now()
  if (mpTokenCache.tenantId === tenantId &&
      mpTokenCache.token &&
      (now - mpTokenCache.timestamp) < CACHE_TTL) {
    return mpTokenCache.token
  }

  // Busca do banco
  const config = await getConfig(tenantId)

  if (!config?.mp_access_token) {
    throw new Error('Token do Mercado Pago não configurado. Vá em Configurações para adicionar.')
  }

  // Atualiza cache
  mpTokenCache = {
    tenantId,
    token: config.mp_access_token,
    timestamp: now
  }

  return mpTokenCache.token
}

/**
 * Cria pagamento PIX para um romaneio
 * @param {string} tenantId - ID do tenant
 * @param {string} romaneioId - ID do romaneio
 * @param {number} valor - Valor do frete
 * @param {Object} dados - Dados adicionais (email, cpf do cliente)
 * @returns {Promise<Object>} - Dados do pagamento criado (QR Code, etc)
 */
export async function criarPagamentoPIX(tenantId, romaneioId, valor, dados = {}) {
  const token = await getMercadoPagoToken(tenantId)

  try {
    const payload = {
      transaction_amount: Number(valor),
      description: `Pagamento de frete - Romaneio ${dados.numeroRomaneio || romaneioId}`,
      payment_method_id: 'pix',
      payer: {
        email: dados.email || 'cliente@email.com',
        first_name: dados.nome || 'Cliente',
        last_name: dados.sobrenome || '',
        identification: {
          type: dados.tipoDoc || 'CPF',
          number: dados.documento || '00000000000',
        },
      },
    }

    const response = await fetch(`${MERCADO_PAGO_API_URL}/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Erro ao criar pagamento PIX')
    }

    const pagamento = await response.json()

    const expiracao = new Date()
    expiracao.setMinutes(expiracao.getMinutes() + 30)

    const { error: dbError } = await supabase
      .from('pagamentos_frete')
      .insert([{
        romaneio_id: romaneioId,
        valor: Number(valor),
        metodo: 'pix',
        status: 'pendente',
        gateway_transaction_id: String(pagamento.id),
        gateway_response: pagamento,
        pix_qr_code: pagamento.point_of_interaction?.transaction_data?.qr_code || null,
        pix_qr_code_base64: pagamento.point_of_interaction?.transaction_data?.qr_code_base64 || null,
        pix_expiracao: expiracao.toISOString(),
      }])

    if (dbError) throw dbError

    return {
      id: pagamento.id,
      qr_code: pagamento.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64: pagamento.point_of_interaction?.transaction_data?.qr_code_base64,
      expiracao: expiracao,
      ticket_url: pagamento.point_of_interaction?.transaction_data?.ticket_url,
    }
  } catch (err) {
    console.error('Erro ao criar pagamento PIX:', err)
    throw err
  }
}

/**
 * Consulta status de um pagamento
 * @param {string} tenantId - ID do tenant
 * @param {string} paymentId - ID do pagamento no Mercado Pago
 * @returns {Promise<Object>} - Status do pagamento
 */
export async function consultarPagamento(tenantId, paymentId) {
  const token = await getMercadoPagoToken(tenantId)

  try {
    const response = await fetch(`${MERCADO_PAGO_API_URL}/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Erro ao consultar pagamento')
    }

    return await response.json()
  } catch (err) {
    console.error('Erro ao consultar pagamento:', err)
    throw err
  }
}

/**
 * Busca pagamento de um romaneio no banco
 * @param {string} romaneioId - ID do romaneio
 * @returns {Promise<Object|null>} - Dados do pagamento
 */
export async function buscarPagamentoRomaneio(romaneioId) {
  const { data, error } = await supabase
    .from('pagamentos_frete')
    .select('*')
    .eq('romaneio_id', romaneioId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Atualiza status do pagamento no banco
 * @param {string} romaneioId - ID do romaneio
 * @param {string} status - Novo status (aprovado, recusado, cancelado)
 * @param {Object} dadosAdicionais - Dados adicionais do gateway
 */
export async function atualizarStatusPagamento(romaneioId, status, dadosAdicionais = {}) {
  const updates = {
    status,
    updated_at: new Date().toISOString(),
    ...dadosAdicionais,
  }

  if (status === 'aprovado') {
    updates.pago_em = new Date().toISOString()
  } else if (status === 'cancelado') {
    updates.cancelado_em = new Date().toISOString()
  }

  const { error } = await supabase
    .from('pagamentos_frete')
    .update(updates)
    .eq('romaneio_id', romaneioId)

  if (error) throw error

  if (status === 'aprovado') {
    const { error: romError } = await supabase
      .from('romaneios')
      .update({
        status: 'frete_pago',
        frete_pago_em: new Date().toISOString(),
      })
      .eq('id', romaneioId)

    if (romError) throw romError
  }
}

/**
 * Verifica e atualiza status de pagamentos pendentes
 * @param {string} tenantId - ID do tenant
 * Deve ser chamado periodicamente ou via webhook
 */
export async function verificarPagamentosPendentes(tenantId) {
  const { data: pendentes, error } = await supabase
    .from('pagamentos_frete')
    .select('*, romaneios(id, tenant_id)')
    .eq('status', 'pendente')
    .not('gateway_transaction_id', 'is', null)

  if (error) throw error

  for (const pag of pendentes || []) {
    try {
      const tid = pag.romaneios?.tenant_id || tenantId
      const statusMP = await consultarPagamento(tid, pag.gateway_transaction_id)

      if (statusMP.status === 'approved') {
        await atualizarStatusPagamento(pag.romaneio_id, 'aprovado', {
          gateway_response: statusMP,
        })
      } else if (statusMP.status === 'rejected' || statusMP.status === 'cancelled') {
        await atualizarStatusPagamento(pag.romaneio_id, 'recusado', {
          gateway_response: statusMP,
        })
      }
    } catch (err) {
      console.error(`Erro ao verificar pagamento ${pag.id}:`, err)
    }
  }
}

/**
 * Processa webhook do Mercado Pago
 * @param {string} tenantId - ID do tenant
 * @param {Object} notification - Dados da notificação
 */
export async function processarWebhook(tenantId, notification) {
  if (notification.type !== 'payment') return

  try {
    const paymentId = notification.data?.id
    if (!paymentId) return

    const statusMP = await consultarPagamento(tenantId, paymentId)

    const { data: pagamento } = await supabase
      .from('pagamentos_frete')
      .select('romaneio_id')
      .eq('gateway_transaction_id', String(paymentId))
      .maybeSingle()

    if (!pagamento) return

    if (statusMP.status === 'approved') {
      await atualizarStatusPagamento(pagamento.romaneio_id, 'aprovado', {
        gateway_response: statusMP,
      })
    } else if (statusMP.status === 'rejected' || statusMP.status === 'cancelled') {
      await atualizarStatusPagamento(pagamento.romaneio_id, 'recusado', {
        gateway_response: statusMP,
      })
    }
  } catch (err) {
    console.error('Erro ao processar webhook:', err)
    throw err
  }
}
