import { supabase, supabasePublic } from '../lib/supabase'

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
    q = q.gte('data_pagamento', filtroDataPag + 'T00:00:00').lte('data_pagamento', filtroDataPag + 'T23:59:59')
  }

  if (filtroStatus && filtroStatus !== 'Todos') {
    if (filtroStatus === 'PAGO') q = q.in('status', ['PAGO', 'BAIXADO'])
    else if (filtroStatus === 'PENDENTE') q = q.not('status', 'in', '("PAGO","BAIXADO","CANCELADO")')
    else q = q.eq('status', filtroStatus)
  }

  if (filtroCliente) q = q.ilike('cliente', `%${filtroCliente}%`)
  if (filtroLive)    q = q.eq('live', filtroLive)

  const { data: lista, error } = await q
  if (error) throw error

  let qRes = supabase.from('cobrancas').select('total, status').eq('tenant_id', tid(tenantId))
  if (dataInicio || dataFim) {
    if (dataInicio) qRes = qRes.gte('data', dataInicio)
    if (dataFim)    qRes = qRes.lte('data', dataFim)
  } else if (filtroData) {
    qRes = qRes.eq('data', filtroData)
  } else {
    const hoje = new Date()
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
    qRes = qRes.gte('data', inicioMes)
  }

  const { data: resData } = await qRes
  let geral = 0, recebido = 0, pendente = 0
  ;(resData || []).forEach(c => {
    if (c.status === 'CANCELADO') return
    const v = Number(c.total) || 0
    geral += v
    if (c.status === 'PAGO' || c.status === 'BAIXADO') recebido += v
    else pendente += v
  })

  return { lista: lista || [], resumo: { geral, recebido, pendente } }
}

export async function getCobrancaById(id) {
  const { data, error } = await supabasePublic.from('cobrancas').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function criarCobranca(tenantId, dados) {
  const { data, error } = await supabase.from('cobrancas').insert([{ tenant_id: tid(tenantId), ...dados }]).select('*').single()
  if (error) throw error
  return data
}

export async function atualizarCobranca(id, campos) {
  const { error } = await supabase.from('cobrancas').update(campos).eq('id', id)
  if (error) throw error
}

export async function excluirCobranca(tenantId, cobranca) {
  try {
    let valorDevolver = 0
    if (Array.isArray(cobranca.itens)) {
      cobranca.itens.forEach(i => { if (i.valor < 0 && String(i.descricao).includes('🎁')) valorDevolver += Math.abs(Number(i.valor)) })
    }
    if (valorDevolver > 0) await devolverCredito(tenantId, cobranca.cliente, valorDevolver)
  } catch (e) { console.warn('Erro créditos:', e.message) }

  const { error } = await supabase.from('cobrancas').delete().eq('id', cobranca.id).eq('tenant_id', tid(tenantId))
  if (error) throw error
}

// ── Sincronização ─────────────────────────────────────────────

export async function sincronizarCobrancaComVendas(tenantId, cobranca) {
  console.log('Sincronizando cobrança:', cobranca.cliente);
  
  const { data: vendas, error: eV } = await supabase.from('vendas').select('produto, modelo, cor, marca, tamanho, preco, codigo, live_nome, status').eq('tenant_id', tid(tenantId)).eq('data_live', cobranca.data).ilike('cliente_nome', cobranca.cliente.trim()).eq('live_nome', cobranca.live || '')
  if (eV) throw eV
  
  const { data: outras } = await supabase.from('cobrancas').select('id, itens').eq('tenant_id', tid(tenantId)).eq('data', cobranca.data).ilike('cliente', cobranca.cliente.trim()).eq('live', cobranca.live || '').neq('id', cobranca.id).neq('status', 'CANCELADO')

  const jaCobrados = new Set()
  ;(outras || []).forEach(o => {
    if (Array.isArray(o.itens)) o.itens.forEach(i => { if (i.descricao && !i.descricao.includes('🎁')) jaCobrados.add(i.descricao.toLowerCase().trim()) })
  })

  const novosItens = []
  let novoTotal = 0
  vendas.forEach(v => {
    const desc = [v.codigo, v.produto, v.modelo, v.cor, v.marca, v.tamanho ? `(${v.tamanho})` : ''].filter(Boolean).join(' ')
    if (jaCobrados.has(desc.toLowerCase().trim())) return
    const cancelado = String(v.status || '').toLowerCase().includes('cancelado')
    const valor = Number(v.preco) || 0
    novosItens.push({ descricao: desc, valor, cancelado })
    if (!cancelado) novoTotal += valor
  })

  if (Array.isArray(cobranca.itens)) {
    cobranca.itens.forEach(i => { if (i.valor < 0 && i.descricao.includes('🎁')) { novosItens.push(i); novoTotal += Number(i.valor) } })
  }
  if (novoTotal < 0) novoTotal = 0

  let link_mp = cobranca.link_mp, id_mp = cobranca.id_mp
  const mudou = Math.abs(novoTotal - Number(cobranca.total)) > 0.01
  const semLink = !link_mp || link_mp === ''

  if (novoTotal > 0 && (mudou || semLink)) {
    try {
      const mp = await gerarPreferenciaMp({ cliente: cobranca.cliente, total: novoTotal, whatsapp: cobranca.whatsapp, data: cobranca.data, live: cobranca.live, idCobranca: cobranca.id })
      link_mp = mp.link; id_mp = mp.id_mp
    } catch (err) {
      console.error('Erro ao gerar link:', err.message);
      if (semLink) throw new Error('Falha no Mercado Pago: ' + err.message);
    }
  } else if (novoTotal <= 0 && Number(cobranca.total) > 0) {
    link_mp = 'Pago com Crédito'
  }

  const campos = { itens: novosItens, total: novoTotal, link_mp, id_mp }
  await atualizarCobranca(cobranca.id, campos)
  return { ...cobranca, ...campos }
}

// ── Mercado Pago ───────────────────────────────────────────────

export async function gerarPreferenciaMp({ cliente, total, whatsapp, data, live, idCobranca }) {
  const MP_TOKEN = import.meta.env.VITE_MP_ACCESS_TOKEN
  if (!MP_TOKEN) throw new Error('VITE_MP_ACCESS_TOKEN não configurado.')

  const titulo = `Pedido-${String(cliente).split(' ')[0]}-${String(data).replace(/\//g,'-')}`

  // URL do webhook no Supabase Edge Function (recebe confirmação de pagamento do MP)
  const WEBHOOK_URL = 'https://gtsdgkalolqzjmmwtvdv.supabase.co/functions/v1/mercadopago-webhook'

  const payload = {
    items: [{ title: titulo, quantity: 1, currency_id: 'BRL', unit_price: parseFloat(Number(total).toFixed(2)) }],
    payer: {
      name: cliente,
      email: String(cliente).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '') + '@vmkids.com.br',
    },
    external_reference: String(idCobranca),
    notification_url: WEBHOOK_URL,
    back_urls: {
      success: 'https://sellcontrol.vercel.app/cobrancas',
      failure: 'https://sellcontrol.vercel.app/cobrancas',
      pending: 'https://sellcontrol.vercel.app/cobrancas',
    },
    auto_return: 'approved',
  }

  // Chamada via proxy
  const resp = await fetch('/api/mercadopago/checkout/preferences', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MP_TOKEN.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  const text = await resp.text()
  let json = {}
  try { if (text) json = JSON.parse(text) } catch (e) { console.error('Erro JSON MP:', text) }

  if (!resp.ok) {
    console.error('Erro MP:', resp.status, json)
    if (resp.status === 403) throw new Error('Acesso Negado (403). Verifique seu Token e se a conta está ativa no Mercado Pago.')
    throw new Error(json.message || `Erro ${resp.status} no Mercado Pago`)
  }

  if (!json.init_point) throw new Error('Link não retornado pelo Mercado Pago.')
  return { link: json.init_point, id_mp: json.id }
}

// ── Lives e Clientes ───────────────────────────────────────────
export async function getLivesParaCobranca(tenantId) {
  const t = tid(tenantId)
  const [resL, resV] = await Promise.all([supabase.from('lives').select('nome').eq('tenant_id', t), supabase.from('vendas').select('live_nome').eq('tenant_id', t).not('live_nome', 'is', null)])
  const nomes = new Set()
  resL.data?.forEach(l => { if (l.nome) nomes.add(l.nome.trim()) })
  resV.data?.forEach(v => { if (v.live_nome) nomes.add(v.live_nome.trim()) })
  return Array.from(nomes).filter(n => n !== "").sort()
}

export async function getClientesParaCobranca(tenantId) {
  const { data } = await supabase.from('clientes').select('instagram, whatsapp').eq('tenant_id', tid(tenantId)).order('instagram')
  return data || []
}

// ── Créditos ───────────────────────────────────────────────────
export async function getSaldoCliente(tenantId, cliente) {
  const { data } = await supabase.from('creditos').select('*').eq('tenant_id', tid(tenantId)).ilike('cliente', cliente.trim())
  if (!data?.length) return { saldo: 0, motivo: '' }
  let saldo = 0, motivo = ''
  data.forEach(c => { const s = Number(c.saldo_restante) || 0; if (s > 0) { saldo += s; motivo = c.motivo || 'Crédito da Loja' } })
  return { saldo, motivo }
}

export async function abaterCredito(tenantId, cliente, valor) {
  const { data } = await supabase.from('creditos').select('*').eq('tenant_id', tid(tenantId)).ilike('cliente', cliente.trim()).gt('saldo_restante', 0).order('created_at')
  if (!data?.length) return
  let f = valor
  for (const c of data) {
    if (f <= 0) break
    const s = Number(c.saldo_restante) || 0
    const u = Number(c.valor_utilizado) || 0
    if (f >= s) { f -= s; await supabase.from('creditos').update({ saldo_restante: 0, valor_utilizado: u + s }).eq('id', c.id) }
    else { await supabase.from('creditos').update({ saldo_restante: s - f, valor_utilizado: u + f }).eq('id', c.id); f = 0 }
  }
}

export async function devolverCredito(tenantId, cliente, valor) {
  const { data } = await supabase.from('creditos').select('*').eq('tenant_id', tid(tenantId)).ilike('cliente', cliente.trim()).gt('valor_utilizado', 0).order('created_at', { ascending: false })
  if (!data?.length) return
  let f = valor
  for (const c of data) {
    if (f <= 0) break
    const s = Number(c.saldo_restante) || 0, u = Number(c.valor_utilizado) || 0, o = Number(c.valor_original) || 0
    const usado = o - s
    if (usado <= 0) continue
    if (f <= usado) { await supabase.from('creditos').update({ saldo_restante: s + f, valor_utilizado: Math.max(0, u - f) }).eq('id', c.id); f = 0 }
    else { await supabase.from('creditos').update({ saldo_restante: o, valor_utilizado: 0 }).eq('id', c.id); f -= usado }
  }
}

// ── Importação ───────────────────────────────────────────────
export async function buscarVendasParaCobranca(tenantId, dataISO, live) {
  let qV = supabase.from('vendas').select('cliente_nome, produto, modelo, cor, marca, tamanho, preco, codigo, live_nome, status').eq('tenant_id', tid(tenantId)).eq('data_live', dataISO)
  if (live) qV = qV.eq('live_nome', live)
  const { data: vendas } = await qV
  if (!vendas?.length) return []
  const { data: cobs } = await supabase.from('cobrancas').select('cliente, itens').eq('tenant_id', tid(tenantId)).eq('data', dataISO).neq('status', 'CANCELADO')
  const ja = new Set()
  ;(cobs || []).forEach(c => { if (Array.isArray(c.itens)) c.itens.forEach(i => { if (i.descricao && !i.descricao.includes('🎁')) ja.add(`${String(c.cliente).toLowerCase().trim()}|${i.descricao.toLowerCase().trim()}`) }) })
  const nomes = [...new Set(vendas.map(v => v.cliente_nome).filter(Boolean))]
  const { data: clis } = await supabase.from('clientes').select('instagram, whatsapp').eq('tenant_id', tid(tenantId)).in('instagram', nomes)
  const mapZ = {}; (clis || []).forEach(c => { mapZ[String(c.instagram).toLowerCase()] = c.whatsapp || '' })
  const agrup = {}
  vendas.forEach(v => {
    const n = String(v.cliente_nome || '').trim().toLowerCase()
    if (!n || n.includes('cancelado')) return
    const d = [v.codigo, v.produto, v.modelo, v.cor, v.marca, v.tamanho ? `(${v.tamanho})` : ''].filter(Boolean).join(' ')
    if (ja.has(`${n}|${d.toLowerCase().trim()}`)) return
    if (!agrup[n]) agrup[n] = { cliente: v.cliente_nome.trim(), whatsapp: mapZ[n] || '', total: 0, data: dataISO, live: v.live_nome || live || '', itens: [] }
    const canc = String(v.status || '').toUpperCase().includes('CANCELADO')
    agrup[n].itens.push({ descricao: d, valor: Number(v.preco) || 0, cancelado: canc })
    if (!canc) agrup[n].total += Number(v.preco) || 0
  })
  return Object.values(agrup)
}
