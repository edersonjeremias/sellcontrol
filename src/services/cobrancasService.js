import { supabase } from '../lib/supabase'

const tid = (tenantId) => tenantId || import.meta.env.VITE_TENANT_ID

// ── Formatação ─────────────────────────────────────────────────
export function formatMoeda(val) {
  if (!val && val !== 0) return 'R$ 0,00'
  const num = typeof val === 'string'
    ? parseFloat(String(val).replace(/\./g, '').replace(',', '.'))
    : Number(val)
  if (isNaN(num)) return 'R$ 0,00'
  return 'R$ ' + num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function parseMoeda(str) {
  if (!str) return 0
  const s = String(str).replace(/R\$/g, '').replace(/\./g, '').replace(',', '.').trim()
  return parseFloat(s) || 0
}

// ── Cobrancas ──────────────────────────────────────────────────

export async function getCobrancas(tenantId, filtros = {}) {
  const {
    dataInicio, dataFim,
    filtroData, filtroDataPag,
    filtroStatus, filtroCliente, filtroLive,
  } = filtros

  // ── Consulta da lista (todos os filtros) ──
  let q = supabase
    .from('cobrancas')
    .select('*')
    .eq('tenant_id', tid(tenantId))
    .order('data', { ascending: true })
    .order('cliente', { ascending: true })

  if (dataInicio) q = q.gte('data', dataInicio)
  if (dataFim)    q = q.lte('data', dataFim)
  if (filtroData) q = q.eq('data', filtroData)

  if (filtroDataPag) {
    q = q
      .gte('data_pagamento', filtroDataPag + 'T00:00:00')
      .lte('data_pagamento', filtroDataPag + 'T23:59:59')
  }

  if (filtroStatus && filtroStatus !== 'Todos') {
    if (filtroStatus === 'PAGO') {
      q = q.in('status', ['PAGO', 'BAIXADO'])
    } else if (filtroStatus === 'PENDENTE') {
      // Pendentes = tudo exceto PAGO, BAIXADO, CANCELADO
      q = q.not('status', 'in', '("PAGO","BAIXADO","CANCELADO")')
    } else {
      q = q.eq('status', filtroStatus)
    }
  }

  if (filtroCliente) q = q.ilike('cliente', `%${filtroCliente}%`)
  if (filtroLive)    q = q.eq('live', filtroLive)

  const { data: lista, error } = await q
  if (error) throw error

  // ── Consulta do resumo (apenas por período, sem filtros de status/cliente/live) ──
  let qRes = supabase
    .from('cobrancas')
    .select('total, status')
    .eq('tenant_id', tid(tenantId))

  if (dataInicio || dataFim) {
    if (dataInicio) qRes = qRes.gte('data', dataInicio)
    if (dataFim)    qRes = qRes.lte('data', dataFim)
  } else if (filtroData) {
    qRes = qRes.eq('data', filtroData)
  } else {
    // Padrão: mês corrente
    const hoje = new Date()
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
    qRes = qRes.gte('data', inicioMes)
  }

  const { data: resData } = await qRes
  let geral = 0, recebido = 0, pendente = 0
  ;(resData || []).forEach(c => {
    if (c.status === 'CANCELADO') return
    geral    += Number(c.total) || 0
    if (c.status === 'PAGO' || c.status === 'BAIXADO') recebido += Number(c.total) || 0
    else pendente += Number(c.total) || 0
  })

  return { lista: lista || [], resumo: { geral, recebido, pendente } }
}

export async function getCobrancaById(id) {
  const { data, error } = await supabase
    .from('cobrancas')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function criarCobranca(tenantId, dados) {
  const { data, error } = await supabase
    .from('cobrancas')
    .insert([{ tenant_id: tid(tenantId), ...dados }])
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function atualizarCobranca(id, campos) {
  const { error } = await supabase
    .from('cobrancas')
    .update(campos)
    .eq('id', id)
  if (error) throw error
}

export async function excluirCobranca(id) {
  const { error } = await supabase
    .from('cobrancas')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ── Lives e Clientes ───────────────────────────────────────────

export async function getLivesParaCobranca(tenantId) {
  const { data } = await supabase
    .from('vendas')
    .select('live')
    .eq('tenant_id', tid(tenantId))
    .not('live', 'is', null)
    .neq('live', '')
  if (!data) return []
  return [...new Set(data.map(r => r.live).filter(Boolean))].sort()
}

export async function getClientesParaCobranca(tenantId) {
  const { data } = await supabase
    .from('clientes')
    .select('instagram, whatsapp')
    .eq('tenant_id', tid(tenantId))
    .order('instagram')
  return data || []
}

// ── Créditos ───────────────────────────────────────────────────

export async function getSaldoCliente(tenantId, cliente) {
  const { data } = await supabase
    .from('creditos')
    .select('*')
    .eq('tenant_id', tid(tenantId))
    .ilike('cliente', cliente.trim())
  if (!data?.length) return { saldo: 0, motivo: '' }
  let saldo = 0, motivo = ''
  data.forEach(c => {
    const s = Number(c.saldo_restante) || 0
    if (s > 0) { saldo += s; motivo = c.motivo || 'Crédito da Loja' }
  })
  return { saldo, motivo }
}

export async function abaterCredito(tenantId, cliente, valorAbater) {
  const { data } = await supabase
    .from('creditos')
    .select('*')
    .eq('tenant_id', tid(tenantId))
    .ilike('cliente', cliente.trim())
    .gt('saldo_restante', 0)
    .order('created_at')

  if (!data?.length) return

  let faltante = valorAbater
  for (const cred of data) {
    if (faltante <= 0) break
    const saldo     = Number(cred.saldo_restante) || 0
    const utilizado = Number(cred.valor_utilizado) || 0
    if (saldo <= 0) continue

    if (faltante >= saldo) {
      faltante -= saldo
      await supabase.from('creditos').update({ saldo_restante: 0, valor_utilizado: utilizado + saldo }).eq('id', cred.id)
    } else {
      await supabase.from('creditos').update({ saldo_restante: saldo - faltante, valor_utilizado: utilizado + faltante }).eq('id', cred.id)
      faltante = 0
    }
  }
}

export async function devolverCredito(tenantId, cliente, valorDevolver) {
  const { data } = await supabase
    .from('creditos')
    .select('*')
    .eq('tenant_id', tid(tenantId))
    .ilike('cliente', cliente.trim())
    .gt('valor_utilizado', 0)
    .order('created_at', { ascending: false })

  if (!data?.length) return

  let faltante = valorDevolver
  for (const cred of data) {
    if (faltante <= 0) break
    const saldo     = Number(cred.saldo_restante)  || 0
    const utilizado = Number(cred.valor_utilizado) || 0
    const original  = Number(cred.valor_original)  || 0
    const usado     = original - saldo
    if (usado <= 0) continue

    if (faltante <= usado) {
      await supabase.from('creditos').update({ saldo_restante: saldo + faltante, valor_utilizado: Math.max(0, utilizado - faltante) }).eq('id', cred.id)
      faltante = 0
    } else {
      await supabase.from('creditos').update({ saldo_restante: original, valor_utilizado: 0 }).eq('id', cred.id)
      faltante -= usado
    }
  }
}

// ── Importação de Vendas ───────────────────────────────────────

export async function buscarVendasParaCobranca(tenantId, dataISO, liveNome) {
  // Busca todas as vendas da data
  let qV = supabase
    .from('vendas')
    .select('cliente, produto, modelo, cor, marca, tamanho, preco, codigo, live')
    .eq('tenant_id', tid(tenantId))
    .eq('data_live', dataISO)

  if (liveNome) qV = qV.eq('live', liveNome)

  const { data: vendas, error } = await qV
  if (error) throw error
  if (!vendas?.length) return []

  // Busca cobranças existentes para excluir itens já cobrados
  let qC = supabase
    .from('cobrancas')
    .select('cliente, itens, live')
    .eq('tenant_id', tid(tenantId))
    .eq('data', dataISO)
    .neq('status', 'CANCELADO')

  if (liveNome) qC = qC.eq('live', liveNome)

  const { data: cobExist } = await qC

  const pecasCobradas = new Set()
  ;(cobExist || []).forEach(c => {
    const itens = Array.isArray(c.itens) ? c.itens : []
    itens.forEach(item => {
      if (item.descricao && !String(item.descricao).includes('🎁')) {
        pecasCobradas.add(
          `${String(c.cliente).toLowerCase().trim()}|${String(item.descricao).toLowerCase().trim()}`
        )
      }
    })
  })

  // Busca WhatsApp dos clientes
  const nomes = [...new Set(vendas.map(v => v.cliente).filter(Boolean))]
  const { data: clientes } = await supabase
    .from('clientes')
    .select('instagram, whatsapp')
    .eq('tenant_id', tid(tenantId))
    .in('instagram', nomes)

  const mapaZap = {}
  ;(clientes || []).forEach(c => {
    mapaZap[String(c.instagram).toLowerCase()] = c.whatsapp || ''
  })

  // Agrupa por cliente
  const agrup = {}
  vendas.forEach(v => {
    if (!v.cliente || v.cliente.toLowerCase().includes('cancelado')) return

    const desc = [v.codigo, v.produto, v.modelo, v.cor, v.marca, v.tamanho ? `(${v.tamanho})` : '']
      .filter(Boolean).join(' ')

    const chave = `${String(v.cliente).toLowerCase().trim()}|${desc.toLowerCase().trim()}`
    if (pecasCobradas.has(chave)) return

    const key = v.cliente.toLowerCase()
    if (!agrup[key]) {
      agrup[key] = {
        cliente:  v.cliente,
        whatsapp: mapaZap[key] || '',
        total:    0,
        data:     dataISO,
        live:     v.live || liveNome || '',
        itens:    [],
      }
    }

    const valor = Number(v.preco) || 0
    agrup[key].itens.push({ descricao: desc, valor, cancelado: false })
    agrup[key].total += valor
  })

  return Object.values(agrup)
}

// ── Mercado Pago ───────────────────────────────────────────────

export async function gerarPreferenciaMp({ cliente, total, whatsapp, data, live, idCobranca }) {
  const MP_TOKEN = import.meta.env.VITE_MP_ACCESS_TOKEN
  if (!MP_TOKEN) throw new Error('VITE_MP_ACCESS_TOKEN não configurado no .env.local')

  const cliSemEspaco = String(cliente).trim().replace(/\s+/g, '')
  const cliEmail     = cliSemEspaco.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
  const email        = (cliEmail || 'cliente') + '@vmkids.com.br'
  const partes       = String(cliente).trim().split(' ')
  const dataTraco    = String(data).replace(/\//g, '-')
  const descLive     = live ? String(live).trim().replace(/\s+/g, '') + '-' : ''
  const titulo       = `Compra-${descLive}${dataTraco}-${cliSemEspaco}`

  const payload = {
    items: [{ title: titulo, quantity: 1, currency_id: 'BRL', unit_price: parseFloat(Number(total).toFixed(2)) }],
    payer: {
      name:    partes[0],
      surname: partes.length > 1 ? partes.slice(1).join(' ') : 'Cliente',
      email,
      phone:   { area_code: '55', number: String(whatsapp || '').replace(/\D/g, '') },
    },
    external_reference: idCobranca,
    back_urls: { success: 'https://www.google.com', failure: 'https://www.google.com', pending: 'https://www.google.com' },
    auto_return: 'approved',
  }

  const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method:  'POST',
    headers: { Authorization: `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })

  const json = await resp.json()
  if (!json.init_point) throw new Error(json.message || 'Erro ao criar preferência MP')
  return { link: json.init_point, idMp: json.id }
}
