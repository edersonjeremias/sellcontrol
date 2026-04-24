import { supabase } from '../lib/supabase'

export const STATUS_PEDIDO_OPTS = [
  '', 'Separado', 'Enviado', 'Comprar',
  'Devolução', 'Gerar Crédito', 'Cancelado', 'Pendente',
]

const EXCLUIR_DO_TOTAL   = new Set(['Cancelado', 'Pendente', 'Devolução', 'Comprar'])
const EXCLUIR_DO_PADRAO  = new Set(['Enviado', 'Cancelado', 'Devolução', 'Gerar Crédito'])

export function calcTotal(itens) {
  return itens.reduce((s, i) => EXCLUIR_DO_TOTAL.has(i.status) ? s : s + (Number(i.preco) || 0), 0)
}

export function filtroPadrao(item) {
  return !EXCLUIR_DO_PADRAO.has(item.status)
}

export async function buscarItensPedido(tenantId, { clienteNome, dataLive, statusFiltro, numeroPedido }) {
  let q = supabase
    .from('pedidos_itens')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('data_live', { ascending: true })
    .order('codigo_peca', { ascending: true })

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
  const updates = [...dirty.values()].map(item => ({
    id: item.id,
    tenant_id: tenantId,
    status: item.status || '',
    observacao: item.observacao || '',
    rastreio: item.rastreio || '',
    data_envio: item.data_envio || null,
    data_devolucao: item.data_devolucao || null,
    updated_at: agora,
  }))
  const { error } = await supabase
    .from('pedidos_itens')
    .upsert(updates, { onConflict: 'id' })
  if (error) throw error
}

export async function getNextNumeroPedido(tenantId) {
  const { data } = await supabase
    .from('pedidos_itens')
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

  const { error: e1 } = await supabase.from('pedidos_itens')
    .update({ numero_pedido: numPedido, updated_at: agora })
    .eq('tenant_id', tenantId).in('id', ids)
  if (e1) throw e1

  const idsSep = itensSemPedido.filter(i => i.status === 'Separado').map(i => i.id)
  if (idsSep.length) {
    const { error: e2 } = await supabase.from('pedidos_itens')
      .update({ status: 'Enviado', data_envio: hoje, updated_at: agora })
      .eq('tenant_id', tenantId).in('id', idsSep)
    if (e2) throw e2
  }
  return numPedido
}

export async function buscarPedidoParaReimprimir(tenantId, numeroPedido) {
  const { data, error } = await supabase
    .from('pedidos_itens')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('numero_pedido', Number(numeroPedido))
    .order('codigo_peca')
  if (error) throw error
  return data || []
}
