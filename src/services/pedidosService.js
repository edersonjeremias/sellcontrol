import { supabase } from '../lib/supabase'

export const STATUS_PEDIDO_OPTS = [
  '', 'Separado', 'Enviado',
  'Devolução', 'Gerar Crédito', 'Cancelado', 'Pendente',
]

const EXCLUIR_DO_TOTAL   = new Set(['Cancelado', 'Pendente', 'Devolução'])
const EXCLUIR_DO_PADRAO  = new Set(['Enviado', 'Cancelado', 'Devolução', 'Gerar Crédito'])

export function calcTotal(itens) {
  return itens.reduce((s, i) => EXCLUIR_DO_TOTAL.has(i.status) ? s : s + (Number(i.preco) || 0), 0)
}

export function filtroPadrao(item) {
  return !EXCLUIR_DO_PADRAO.has(item.status)
}

export async function buscarItensPedido(tenantId, { clienteNome, dataLive, statusFiltro, numeroPedido }) {
  let q = supabase
    .from('vendas')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('data_live', { ascending: true })
    .order('codigo', { ascending: true })

  if (clienteNome?.trim()) q = q.ilike('cliente_nome', `%${clienteNome.trim()}%`)
  if (dataLive)            q = q.eq('data_live', dataLive)
  if (numeroPedido)        q = q.eq('numero_pedido', Number(numeroPedido))

  if (statusFiltro === 'nao_enviados') {
    q = q.not('status', 'in', '("Enviado","Cancelado","Devolução","Gerar Crédito")')
  } else if (statusFiltro && statusFiltro !== 'todos') {
    q = q.eq('status', statusFiltro)
  }

  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function salvarItens(tenantId, dirty) {
  if (!dirty.size) return
  const agora = new Date().toISOString()
  for (const item of dirty.values()) {
    const updates = {
      status: item.status || '',
      observacao: item.observacao || '',
      updated_at: agora,
    }
    if (!item.status) updates.numero_pedido = null
    const { error } = await supabase.from('vendas')
      .update(updates)
      .eq('tenant_id', tenantId)
      .eq('id', item.id)
    if (error) throw error
  }
}

export async function getNextNumeroPedido(tenantId) {
  const { data } = await supabase
    .from('vendas')
    .select('numero_pedido')
    .eq('tenant_id', tenantId)
    .not('numero_pedido', 'is', null)
    .order('numero_pedido', { ascending: false })
    .limit(1)
  return ((data?.[0]?.numero_pedido) || 0) + 1
}

export async function gerarPedido(tenantId, itensSemPedido) {
  if (!itensSemPedido.length) throw new Error('Nenhum item sem pedido para gerar.')
  const numPedido = await getNextNumeroPedido(tenantId)
  const hoje = new Date().toISOString().slice(0, 10)
  const agora = new Date().toISOString()
  const ids = itensSemPedido.map(i => i.id)

  const { error: e1 } = await supabase.from('vendas')
    .update({ numero_pedido: numPedido, updated_at: agora })
    .eq('tenant_id', tenantId).in('id', ids)
  if (e1) throw e1

  const idsSep = itensSemPedido.filter(i => i.status === 'Separado').map(i => i.id)
  if (idsSep.length) {
    const { error: e2 } = await supabase.from('vendas')
      .update({ status: 'Enviado', data_envio: hoje, updated_at: agora })
      .eq('tenant_id', tenantId).in('id', idsSep)
    if (e2) throw e2
  }
  return numPedido
}

export async function buscarPedidoParaReimprimir(tenantId, numeroPedido) {
  const { data, error } = await supabase
    .from('vendas')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('numero_pedido', Number(numeroPedido))
    .order('codigo')
  if (error) throw error
  return data || []
}

export async function atribuirRomaneio(tenantId, ids, romaneio) {
  const { error } = await supabase.from('vendas')
    .update({ numero_pedido: romaneio || null, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .in('id', ids)
  if (error) throw error
}

export async function adicionarSeparadosAoRomaneio(tenantId, ids, romaneio) {
  const hoje = new Date().toISOString().slice(0, 10)
  const agora = new Date().toISOString()
  const { error } = await supabase.from('vendas')
    .update({ status: 'Enviado', numero_pedido: romaneio, data_envio: hoje, updated_at: agora })
    .eq('tenant_id', tenantId)
    .in('id', ids)
  if (error) throw error
}

export async function calcRomaneioTotal(tenantId, romaneio, clienteNome) {
  const { data } = await supabase
    .from('vendas')
    .select('preco')
    .eq('tenant_id', tenantId)
    .eq('numero_pedido', Number(romaneio))
    .eq('status', 'Enviado')
    .ilike('cliente_nome', clienteNome || '')
  return (data || []).reduce((s, i) => s + (Number(i.preco) || 0), 0)
}

// ============================================================================
// SISTEMA DE ENVIOS - Romaneios com Peso/Dimensões
// ============================================================================

/**
 * Cria romaneio com peso/dimensões e associa sacolinhas
 * @param {string} tenantId - ID do tenant
 * @param {Array} itensSemPedido - Itens sem romaneio
 * @param {Object} dimensoes - { peso, altura, largura, comprimento }
 * @returns {Promise<string>} - Número do romaneio gerado
 */
export async function criarRomaneioComDimensoes(tenantId, itensSemPedido, dimensoes = {}) {
  if (!itensSemPedido.length) throw new Error('Nenhum item sem pedido para gerar romaneio.')

  // 1. Gera próximo número de romaneio usando função SQL
  const { data: numData, error: numError } = await supabase
    .rpc('gerar_numero_romaneio', { p_tenant_id: tenantId })

  if (numError) throw numError
  const numeroRomaneio = numData

  // 2. Pega cliente do primeiro item (todos devem ser do mesmo cliente)
  const clienteInstagram = itensSemPedido[0]?.cliente_nome || ''

  // 3. Cria registro na tabela romaneios
  const { data: romaneio, error: romError } = await supabase
    .from('romaneios')
    .insert([{
      tenant_id: tenantId,
      numero: numeroRomaneio,
      cliente_instagram: clienteInstagram,
      peso: dimensoes.peso ? Number(dimensoes.peso) : null,
      altura: dimensoes.altura ? Number(dimensoes.altura) : null,
      largura: dimensoes.largura ? Number(dimensoes.largura) : null,
      comprimento: dimensoes.comprimento ? Number(dimensoes.comprimento) : null,
      status: 'pronto',
      pronto_em: new Date().toISOString(),
    }])
    .select('id')
    .single()

  if (romError) throw romError

  // 4. Agrupa itens por sacolinha e associa ao romaneio
  const sacolinhasMap = new Map()
  itensSemPedido.forEach(item => {
    if (item.sacolinha) {
      if (!sacolinhasMap.has(item.sacolinha)) {
        sacolinhasMap.set(item.sacolinha, {
          sacolinha: item.sacolinha,
          data_live: item.data_live,
          live_nome: item.live_nome,
        })
      }
    }
  })

  if (sacolinhasMap.size > 0) {
    const sacolinhasArray = Array.from(sacolinhasMap.values()).map(s => ({
      romaneio_id: romaneio.id,
      ...s,
    }))

    const { error: sacError } = await supabase
      .from('romaneio_sacolinhas')
      .insert(sacolinhasArray)

    if (sacError) console.warn('Erro ao associar sacolinhas:', sacError)
  }

  // 5. Extrai apenas o número do romaneio (ROM-001 → 1)
  const numeroPedido = parseInt(numeroRomaneio.replace(/\D/g, ''))

  // 6. Atualiza vendas com numero_pedido (compatibilidade com sistema atual)
  const hoje = new Date().toISOString().slice(0, 10)
  const agora = new Date().toISOString()
  const ids = itensSemPedido.map(i => i.id)

  const { error: e1 } = await supabase
    .from('vendas')
    .update({ numero_pedido: numeroPedido, updated_at: agora })
    .eq('tenant_id', tenantId)
    .in('id', ids)

  if (e1) throw e1

  // 7. Marca itens "Separados" como "Enviado"
  const idsSep = itensSemPedido.filter(i => i.status === 'Separado').map(i => i.id)
  if (idsSep.length) {
    const { error: e2 } = await supabase
      .from('vendas')
      .update({ status: 'Enviado', data_envio: hoje, updated_at: agora })
      .eq('tenant_id', tenantId)
      .in('id', idsSep)

    if (e2) throw e2
  }

  return numeroPedido
}
