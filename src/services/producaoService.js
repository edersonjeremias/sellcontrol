import { supabase } from '../lib/supabase'
import { getClientes } from './clientesService'

const TENANT_ID = (tenantId) => tenantId || import.meta.env.VITE_TENANT_ID

export const STATUS_PROD_OPTS = [
  'Iniciado', 'Lavando', 'Costureira', 'Mancha', 'Secando',
  'Falta peças', 'Sapateiro', 'Pronto', 'Aguard. pag.', 'Liberado',
  'Urgente', 'S/ Embalagem', 'Voltar p/ Estoque', 'Repetido', 'Comprar',
]

export const PACOTE_OPTS = ['PC P', 'CPP 20x20x20', 'CP 40x20x20', 'CM 40x30x30', 'CG 50x30x40', 'CGG 60x40x40', 'ESPECIAL']

export const STATUS_ENTREGA_OPTS = [
  'Aguard. pagamento', 'Aguard. dados', 'Cliente informado', 'Cliente Retira',
  'Frete pago', 'Enviado', 'Retirou', 'Voltou estoque', 'Conferir pg',
]

const FINAL_ENTREGA = new Set(['Enviado', 'Retirou', 'Voltou estoque', 'Cliente Retira'])

function toDateOnly(dateValue) {
  if (!dateValue) return null
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function parseMoney(value) {
  if (value === null || value === undefined || value === '') return null
  const normalized = String(value).replace(/\./g, '').replace(',', '.')
  const num = Number.parseFloat(normalized)
  return Number.isNaN(num) ? null : num
}

function formatDateBr(dateValue) {
  if (!dateValue) return ''
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-BR')
}

function businessDaysBetween(startDateValue, endDateValue) {
  const start = new Date(startDateValue)
  const end = new Date(endDateValue)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  if (start >= end) return 0

  let cur = new Date(start)
  cur.setDate(cur.getDate() + 1)

  let days = 0
  let guard = 0
  while (cur <= end && guard < 3000) {
    const day = cur.getDay()
    if (day !== 0 && day !== 6) days += 1
    cur.setDate(cur.getDate() + 1)
    guard += 1
  }
  return Math.max(days, 0)
}

function buildRastreioLink(code) {
  const value = (code || '').trim()
  if (!value) return ''
  if (value.toUpperCase().startsWith('BLI')) {
    return `https://www.loggi.com/rastreador/${value}`
  }
  return `https://rastreamento.correios.com.br/app/index.php?objetos=${value}`
}

function saudacaoHora() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export async function getProducaoData(tenantId = null) {
  const tid = TENANT_ID(tenantId)
  const [pedidosRes, clientesRes, devedoresRes] = await Promise.all([
    supabase
      .from('producao_pedidos')
      .select('*')
      .eq('tenant_id', tid)
      .order('data_solicitado', { ascending: true }),
    getClientes(tid),
    supabase
      .from('cobrancas')
      .select('cliente')
      .eq('tenant_id', tid)
      .not('status', 'in', '("PAGO","BAIXADO","CANCELADO")'),
  ])

  if (pedidosRes.error) throw pedidosRes.error
  if (clientesRes.error) throw clientesRes.error

  const clientMap = new Map()
  ;(clientesRes.data || []).forEach((row) => {
    const key = (row.instagram || '').replace(/^@/, '').trim().toLowerCase()
    if (key) clientMap.set(key, { whatsapp: row.whatsapp || '', bloqueado: !!row.bloqueado })
  })

  const devedorSet = new Set(
    (devedoresRes.data || []).map((d) => (d.cliente || '').trim().toLowerCase())
  )

  const today = new Date()
  let rows = (pedidosRes.data || []).map((row) => {
    const clienteKey = (row.cliente_nome || '').replace(/^@/, '').trim().toLowerCase()
    const clientInfo = clientMap.get(clienteKey) || { whatsapp: '', bloqueado: false }

    const isFinal = FINAL_ENTREGA.has(row.status_entrega || '') || (row.status_prod || '') === 'Repetido'
    const endDate = isFinal ? (row.data_enviado || row.data_pronto || today) : today
    const diasUteis = businessDaysBetween(row.data_solicitado, endDate)

    return {
      ...row,
      data_solicitado_fmt: formatDateBr(row.data_solicitado),
      data_pronto_fmt: formatDateBr(row.data_pronto),
      data_enviado_fmt: formatDateBr(row.data_enviado),
      dias_u: diasUteis,
      atrasado: !isFinal && diasUteis >= 5,
      bloqueado: !!clientInfo.bloqueado,
      whatsapp: clientInfo.whatsapp,
    }
  })

  // Auto-liberação: 'Aguard. pag.' → 'Liberado' se cliente não tem mais dívida
  const toLiberar = rows.filter(
    (r) => r.status_prod === 'Aguard. pag.' && !devedorSet.has((r.cliente_nome || '').trim().toLowerCase())
  )
  if (toLiberar.length > 0) {
    await Promise.all(
      toLiberar.map((r) =>
        supabase.from('producao_pedidos').update({ status_prod: 'Liberado' }).eq('tenant_id', tid).eq('id', r.id)
      )
    )
    const liberadosIds = new Set(toLiberar.map((r) => r.id))
    rows = rows.map((r) => (liberadosIds.has(r.id) ? { ...r, status_prod: 'Liberado' } : r))
  }

  const clientes = (clientesRes.data || [])
    .map((row) => (row.instagram || '').replace(/^@/, '').trim())
    .filter(Boolean)
  return { rows, clientes }
}

export async function checkInadimplencia(tenantId, clienteNome) {
  const nome = (clienteNome || '').trim()
  if (!nome) return false
  const { data } = await supabase
    .from('cobrancas')
    .select('id')
    .eq('tenant_id', tenantId)
    .ilike('cliente', nome)
    .not('status', 'in', '("PAGO","BAIXADO","CANCELADO")')
    .limit(1)
  return (data?.length ?? 0) > 0
}

export async function saveProducaoField(tenantId, id, fields) {
  const { error } = await supabase
    .from('producao_pedidos')
    .update(fields)
    .eq('tenant_id', tenantId)
    .eq('id', id)
  if (error) throw error
}

export async function createProducaoPedido(tenantId = null, clienteNome) {
  const tid = TENANT_ID(tenantId)
  const nome = (clienteNome || '').trim()
  if (!nome) throw new Error('Selecione um cliente válido.')

  const payload = {
    tenant_id: tid,
    cliente_nome: nome,
    data_solicitado: toDateOnly(new Date()),
  }

  const { error } = await supabase.from('producao_pedidos').insert(payload)
  if (error) throw error
}

export async function duplicateProducaoPedido(tenantId = null, pedidoId) {
  const tid = TENANT_ID(tenantId)
  const { data, error } = await supabase
    .from('producao_pedidos')
    .select('*')
    .eq('tenant_id', tid)
    .eq('id', pedidoId)
    .single()

  if (error) throw error

  const copy = {
    tenant_id: tid,
    cliente_nome: data.cliente_nome || '',
    status_prod: data.status_prod || '',
    obs_cliente: data.obs_cliente || '',
    obs_prod: data.obs_prod || '',
    peso: data.peso || '',
    pacote: data.pacote || '',
    data_solicitado: data.data_solicitado || toDateOnly(new Date()),
    dias: data.dias || 0,
    data_pronto: data.data_pronto,
    status_entrega: data.status_entrega || '',
    pedido_codigo: data.pedido_codigo || '',
    valor_frete: data.valor_frete,
    valor_dec: data.valor_dec,
    msg_cobranca: data.msg_cobranca || '',
    data_enviado: data.data_enviado,
    rastreio: '',
    link_rastreio: '',
  }

  const { error: insertError } = await supabase.from('producao_pedidos').insert(copy)
  if (insertError) throw insertError
}

export async function saveProducaoPedido(tenantId = null, row) {
  const tid = TENANT_ID(tenantId)
  const payload = {
    tenant_id: tid,
    cliente_nome: row.cliente_nome || '',
    status_prod: row.status_prod || '',
    obs_cliente: row.obs_cliente || '',
    obs_prod: row.obs_prod || '',
    peso: row.peso || '',
    pacote: row.pacote || '',
    data_solicitado: toDateOnly(row.data_solicitado) || toDateOnly(new Date()),
    dias: Number.isFinite(row.dias) ? row.dias : 0,
    data_pronto: toDateOnly(row.data_pronto),
    status_entrega: row.status_entrega || '',
    pedido_codigo: row.pedido_codigo || '',
    valor_frete: parseMoney(row.valor_frete),
    valor_dec: parseMoney(row.valor_dec),
    msg_cobranca: row.msg_cobranca || '',
    data_enviado: toDateOnly(row.data_enviado),
    rastreio: row.rastreio || '',
    link_rastreio: row.link_rastreio || '',
    romaneio: row.romaneio ? Number(row.romaneio) : null,
  }

  if (payload.status_prod === 'Pronto' && payload.pacote && !payload.data_pronto) {
    payload.data_pronto = toDateOnly(new Date())
  }

  if ((payload.status_entrega === 'Retirou' || payload.status_entrega === 'Enviado') && !payload.data_enviado) {
    payload.data_enviado = toDateOnly(new Date())
  }

  if (payload.valor_frete !== null && !payload.msg_cobranca) {
    payload.msg_cobranca = `${saudacaoHora()} ${payload.cliente_nome}, o valor do frete ficou em R$${payload.valor_frete.toFixed(2).replace('.', ',')}.`
  }

  if (payload.rastreio && !payload.link_rastreio) {
    payload.link_rastreio = buildRastreioLink(payload.rastreio)
  }

  const { error } = await supabase
    .from('producao_pedidos')
    .update(payload)
    .eq('tenant_id', tid)
    .eq('id', row.id)

  if (error) throw error
}
