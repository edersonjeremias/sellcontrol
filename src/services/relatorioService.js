import { supabase } from '../lib/supabase'

const tid = (tenantId) => tenantId || import.meta.env.VITE_TENANT_ID

export function fmtR(val) {
  if (!val && val !== 0) return 'R$ 0,00'
  const n = typeof val === 'string'
    ? parseFloat(String(val).replace(/\./g, '').replace(',', '.'))
    : Number(val)
  if (isNaN(n)) return 'R$ 0,00'
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function tabelaFalta(error) {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' ||
    error.message?.includes('does not exist') || error.message?.includes('schema cache')
}

// Clientes para autocomplete
export async function getClientesRelatorio(tenantId) {
  const { data } = await supabase
    .from('clientes')
    .select('instagram')
    .eq('tenant_id', tid(tenantId))
    .order('instagram')
  return (data || []).map(c => c.instagram)
}

// ── Relatório: vendas ──────────────────────────────────────────

export async function getVendasRelatorio(tenantId, { dataInicio, dataFim, busca } = {}) {
  let q = supabase
    .from('vendas')
    .select('id, produto, modelo, cor, marca, tamanho, preco, codigo, cliente_nome, data_live, live_nome, status, created_at')
    .eq('tenant_id', tid(tenantId))
    .order('data_live', { ascending: false })
    .order('created_at', { ascending: false })

  if (dataInicio) q = q.gte('data_live', dataInicio)
  if (dataFim)    q = q.lte('data_live', dataFim)

  const { data, error } = await q
  if (error) throw error

  let rows = data || []
  if (busca?.trim()) {
    const termos = busca.trim().toLowerCase().split(/\s+/)
    rows = rows.filter(r => {
      const txt = [r.produto, r.modelo, r.cor, r.marca, r.cliente_nome, r.live_nome, r.codigo]
        .join(' ').toLowerCase()
      return termos.every(t => txt.includes(t))
    })
  }
  return rows
}

// ── Contas a pagar ─────────────────────────────────────────────

export async function getContasPagar(tenantId, { dataInicio, dataFim } = {}) {
  let q = supabase
    .from('contas_pagar')
    .select('*')
    .eq('tenant_id', tid(tenantId))
    .order('data_vencimento', { ascending: false })

  if (dataInicio) q = q.gte('data_vencimento', dataInicio)
  if (dataFim)    q = q.lte('data_vencimento', dataFim)

  const { data, error } = await q
  if (tabelaFalta(error)) return []
  if (error) throw error
  return data || []
}

export async function salvarContaPagar(tenantId, conta) {
  const { id, ...fields } = { ...conta, tenant_id: tid(tenantId) }
  if (id) {
    const { error } = await supabase.from('contas_pagar').update(fields).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('contas_pagar').insert([fields])
    if (error) throw error
  }
}

export async function excluirContaPagar(id) {
  const { error } = await supabase.from('contas_pagar').delete().eq('id', id)
  if (error) throw error
}

// ── Créditos de clientes ──────────────────────────────────────
// Usa a mesma tabela `creditos` que a página Cobranças,
// para que o saldo apareça automaticamente no abatimento de cobranças.

export async function getCreditosClientes(tenantId, { dataInicio, dataFim } = {}) {
  let q = supabase
    .from('creditos')
    .select('id, cliente, valor_original, saldo_restante, valor_utilizado, motivo, created_at')
    .eq('tenant_id', tid(tenantId))
    .order('created_at', { ascending: false })

  if (dataInicio) q = q.gte('created_at', dataInicio + 'T00:00:00')
  if (dataFim)    q = q.lte('created_at', dataFim   + 'T23:59:59')

  const { data, error } = await q
  if (tabelaFalta(error)) return []
  if (error) throw error

  return (data || []).map(c => ({
    id:         c.id,
    data:       (c.created_at || '').slice(0, 10),
    cliente:    c.cliente,
    valor:      c.valor_original,
    saldo:      c.saldo_restante,
    utilizado:  c.valor_utilizado,
    observacao: c.motivo,
  }))
}

export async function salvarCredito(tenantId, credito) {
  const valor = Number(credito.valor) || 0
  if (credito.id) {
    const { error } = await supabase.from('creditos')
      .update({ cliente: credito.cliente || '', valor_original: valor, motivo: credito.observacao || 'Crédito da Loja' })
      .eq('id', credito.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('creditos').insert([{
      tenant_id:      tid(tenantId),
      cliente:        credito.cliente || '',
      valor_original: valor,
      saldo_restante: valor,
      valor_utilizado: 0,
      motivo:         credito.observacao || 'Crédito da Loja',
    }])
    if (error) throw error
  }
}

export async function excluirCredito(id) {
  const { error } = await supabase.from('creditos').delete().eq('id', id)
  if (error) throw error
}

// ── Dashboard: gráficos ────────────────────────────────────────

export async function getVendasPorAno(tenantId) {
  const { data, error } = await supabase
    .from('vendas')
    .select('preco, status, data_live')
    .eq('tenant_id', tid(tenantId))
    .not('data_live', 'is', null)

  if (error) throw error
  const map = {}
  ;(data || []).forEach(v => {
    if (!v.data_live || (v.status || '').toUpperCase() === 'CANCELADO') return
    const ano = v.data_live.slice(0, 4)
    map[ano] = (map[ano] || 0) + (Number(v.preco) || 0)
  })
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export async function getVendasPorMes(tenantId, ano) {
  const { data, error } = await supabase
    .from('vendas')
    .select('preco, status, data_live')
    .eq('tenant_id', tid(tenantId))
    .gte('data_live', `${ano}-01-01`)
    .lte('data_live', `${ano}-12-31`)

  if (error) throw error
  const map = {}
  ;(data || []).forEach(v => {
    if (!v.data_live || (v.status || '').toUpperCase() === 'CANCELADO') return
    const m = parseInt(v.data_live.slice(5, 7)) - 1
    map[m] = (map[m] || 0) + (Number(v.preco) || 0)
  })
  return Array.from({ length: 12 }, (_, i) => ({ label: MESES[i], value: map[i] || 0 }))
}

export async function getVendasPorDia(tenantId, ano, mes) {
  const dataInicio = `${ano}-${String(mes).padStart(2,'0')}-01`
  const ultimoDia  = new Date(ano, mes, 0).getDate()
  const dataFim    = `${ano}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`

  const { data, error } = await supabase
    .from('vendas')
    .select('preco, status, data_live')
    .eq('tenant_id', tid(tenantId))
    .gte('data_live', dataInicio)
    .lte('data_live', dataFim)

  if (error) throw error
  const map = {}
  ;(data || []).forEach(v => {
    if (!v.data_live || (v.status || '').toUpperCase() === 'CANCELADO') return
    const dia = v.data_live.slice(8, 10)
    map[dia] = (map[dia] || 0) + (Number(v.preco) || 0)
  })
  return Array.from({ length: ultimoDia }, (_, i) => {
    const d = String(i + 1).padStart(2, '0')
    return { label: d, value: map[d] || 0 }
  })
}

export async function getTopClientesMes(tenantId, ano, mes) {
  const dataInicio = `${ano}-${String(mes).padStart(2,'0')}-01`
  const ultimoDia  = new Date(ano, mes, 0).getDate()
  const dataFim    = `${ano}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`

  const { data, error } = await supabase
    .from('vendas')
    .select('preco, cliente_nome, status')
    .eq('tenant_id', tid(tenantId))
    .gte('data_live', dataInicio)
    .lte('data_live', dataFim)

  if (error) throw error
  const map = {}
  ;(data || []).forEach(v => {
    if ((v.status || '').toUpperCase() === 'CANCELADO') return
    const cli = (v.cliente_nome || '').trim() || '(sem cliente)'
    map[cli] = (map[cli] || 0) + (Number(v.preco) || 0)
  })
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
}

export async function getVendasVsComprasDia(tenantId, ano, mes) {
  const dataInicio = `${ano}-${String(mes).padStart(2,'0')}-01`
  const ultimoDia  = new Date(ano, mes, 0).getDate()
  const dataFim    = `${ano}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`

  const [vendasRes, contasRes] = await Promise.all([
    supabase.from('vendas').select('preco, status, data_live')
      .eq('tenant_id', tid(tenantId))
      .gte('data_live', dataInicio).lte('data_live', dataFim),
    supabase.from('contas_pagar').select('valor, data_pagamento, categoria')
      .eq('tenant_id', tid(tenantId))
      .gte('data_pagamento', dataInicio).lte('data_pagamento', dataFim)
      .eq('status', 'PAGO'),
  ])

  const vMap = {}, cMap = {}
  ;(vendasRes.data || []).forEach(v => {
    if (!v.data_live || (v.status || '').toUpperCase() === 'CANCELADO') return
    const d = v.data_live.slice(8, 10)
    vMap[d] = (vMap[d] || 0) + (Number(v.preco) || 0)
  })
  ;(contasRes.data || []).forEach(c => {
    const cat = (c.categoria || '').toUpperCase()
    if (!cat.includes('COMPRA') && !cat.includes('REVENDA')) return
    if (!c.data_pagamento) return
    const d = c.data_pagamento.slice(8, 10)
    cMap[d] = (cMap[d] || 0) + (Number(c.valor) || 0)
  })

  return Array.from({ length: ultimoDia }, (_, i) => {
    const d = String(i + 1).padStart(2, '0')
    return { label: d, vendas: vMap[d] || 0, compras: cMap[d] || 0 }
  })
}

export async function getFluxoCaixaMes(tenantId, ano, mes) {
  const dataInicio = `${ano}-${String(mes).padStart(2,'0')}-01`
  const ultimoDia  = new Date(ano, mes, 0).getDate()
  const dataFim    = `${ano}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`

  const [entRes, saiRes] = await Promise.all([
    supabase.from('cobrancas').select('total, data_pagamento')
      .eq('tenant_id', tid(tenantId))
      .gte('data_pagamento', dataInicio + 'T00:00:00').lte('data_pagamento', dataFim + 'T23:59:59')
      .in('status', ['PAGO', 'BAIXADO']),
    supabase.from('contas_pagar').select('valor, data_pagamento')
      .eq('tenant_id', tid(tenantId))
      .gte('data_pagamento', dataInicio).lte('data_pagamento', dataFim)
      .eq('status', 'PAGO'),
  ])

  const eMap = {}, sMap = {}
  ;(entRes.data || []).forEach(c => {
    if (!c.data_pagamento) return
    const d = c.data_pagamento.slice(8, 10)
    eMap[d] = (eMap[d] || 0) + (Number(c.total) || 0)
  })
  ;(saiRes.data || []).forEach(c => {
    if (!c.data_pagamento) return
    const d = c.data_pagamento.slice(8, 10)
    sMap[d] = (sMap[d] || 0) + (Number(c.valor) || 0)
  })

  return Array.from({ length: ultimoDia }, (_, i) => {
    const d = String(i + 1).padStart(2, '0')
    return { label: d, entradas: eMap[d] || 0, saidas: sMap[d] || 0 }
  })
}

// ── Dashboard: Resumo financeiro mensal ───────────────────────

export async function getResumoFinanceiro(tenantId, ano, mes) {
  const dataInicio = `${ano}-${String(mes).padStart(2,'0')}-01`
  const ultimoDia  = new Date(ano, mes, 0).getDate()
  const dataFim    = `${ano}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`

  const [vendasRes, cobRes, contasRes, credRes] = await Promise.all([
    supabase.from('vendas').select('preco, status')
      .eq('tenant_id', tid(tenantId))
      .gte('data_live', dataInicio).lte('data_live', dataFim),
    supabase.from('cobrancas').select('total, status')
      .eq('tenant_id', tid(tenantId))
      .gte('data', dataInicio).lte('data', dataFim),
    supabase.from('contas_pagar').select('valor, status, tipo_despesa, categoria')
      .eq('tenant_id', tid(tenantId))
      .gte('data_vencimento', dataInicio).lte('data_vencimento', dataFim),
    supabase.from('creditos_clientes').select('valor')
      .eq('tenant_id', tid(tenantId))
      .gte('data', dataInicio).lte('data', dataFim),
  ])

  let vendidoBruto = 0, cancelados = 0, devolucoes = 0, comprasRevenda = 0
  ;(vendasRes.data || []).forEach(v => {
    const val = Number(v.preco) || 0
    const st  = (v.status || '').toUpperCase()
    if (st === 'CANCELADO') cancelados += val
    else if (st === 'DEVOLVIDO') devolucoes += val
    else vendidoBruto += val
  })

  const totalCreditos = (credRes.data || []).reduce((s, c) => s + (Number(c.valor) || 0), 0)

  let fixasPagas = 0, varPagas = 0, fixasAP = 0, varAP = 0, proLabPago = 0, proLabAP = 0
  ;(contasRes.data || []).forEach(c => {
    const val  = Number(c.valor) || 0
    const pago = (c.status || '').toUpperCase() === 'PAGO'
    const cat  = (c.categoria || '').toUpperCase()
    const tipo = (c.tipo_despesa || '').toLowerCase()

    if (cat.includes('COMPRA') || cat.includes('REVENDA')) {
      comprasRevenda += val
      return
    }
    if (cat.includes('PRÓ') || cat.includes('PRO') || cat.includes('LABORE')) {
      if (pago) proLabPago += val; else proLabAP += val
      return
    }
    if (tipo === 'fixa') { if (pago) fixasPagas += val; else fixasAP += val }
    else                 { if (pago) varPagas   += val; else varAP   += val }
  })

  let aReceber = 0, recebido = 0
  ;(cobRes.data || []).forEach(c => {
    const val = Number(c.total) || 0
    const st  = (c.status || '').toUpperCase()
    if (st === 'PAGO' || st === 'BAIXADO') recebido += val
    else if (st !== 'CANCELADO') aReceber += val
  })

  const fatLiquido    = vendidoBruto - cancelados - devolucoes - totalCreditos
  const lucroBruto    = fatLiquido - comprasRevenda
  const margem        = fatLiquido > 0 ? lucroBruto / fatLiquido : 0
  const despesasTot   = fixasPagas + varPagas + proLabPago + fixasAP + varAP + proLabAP
  const pontoEq       = margem > 0 ? despesasTot / margem : 0
  const faltaVender   = pontoEq - fatLiquido
  const pmr           = fatLiquido > 0 ? (aReceber / fatLiquido) * 30 : 0
  const pmp           = despesasTot > 0 ? ((fixasAP + varAP + proLabAP) / despesasTot) * 30 : 0

  return {
    vendidoBruto, cancelados, devolucoes, totalCreditos,
    comprasRevenda, fatLiquido, lucroBruto, margemPct: margem * 100,
    fixasPagas, varPagas, proLabPago,
    fixasAP, varAP, proLabAP,
    despesasTot, aReceber, recebido,
    pontoEq, faltaVender, pmr, pmp,
  }
}
