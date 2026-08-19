import { supabase } from '../lib/supabase'

const tid = (tenantId) => tenantId || import.meta.env.VITE_TENANT_ID

// Converte preço para número (aceita string com vírgula ou número)
function toNum(val) {
  if (!val && val !== 0) return 0
  if (typeof val === 'string') {
    return parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0
  }
  return Number(val) || 0
}

export function fmtR(val) {
  if (!val && val !== 0) return 'R$ 0,00'
  const n = toNum(val)
  if (isNaN(n)) return 'R$ 0,00'
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function tabelaFalta(error) {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' ||
    error.message?.includes('does not exist') || error.message?.includes('schema cache')
}

// Clientes para autocomplete - BUSCA TODOS (sem limite de 1000)
export async function getClientesRelatorio(tenantId) {
  let todos = []
  let pag = 0
  const LOTE = 1000

  while (true) {
    const { data, error } = await supabase
      .from('clientes')
      .select('instagram')
      .eq('tenant_id', tid(tenantId))
      .order('instagram')
      .range(pag * LOTE, (pag + 1) * LOTE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    todos = todos.concat(data)
    if (data.length < LOTE) break // Última página
    pag++
  }

  return todos.map(c => c.instagram).filter(Boolean)
}

// ── Relatório: vendas ──────────────────────────────────────────

export async function getVendasRelatorio(tenantId, { dataInicio, dataFim } = {}) {
  let q = supabase
    .from('vendas')
    .select('id, produto, modelo, cor, marca, tamanho, preco, codigo, sacolinha, cliente_nome, data_live, live_nome, status, created_at')
    .eq('tenant_id', tid(tenantId))
    .order('data_live', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  // Filtra por data_live (vendidos) OU created_at (cadastrados)
  if (dataInicio && dataFim) {
    // (data_live no período E not null) OU (data_live null E created_at no período)
    q = q.or(`and(data_live.gte.${dataInicio},data_live.lte.${dataFim}),and(data_live.is.null,created_at.gte.${dataInicio}T00:00:00,created_at.lte.${dataFim}T23:59:59)`)
  } else if (dataInicio) {
    q = q.or(`data_live.gte.${dataInicio},and(data_live.is.null,created_at.gte.${dataInicio}T00:00:00)`)
  } else if (dataFim) {
    q = q.or(`data_live.lte.${dataFim},and(data_live.is.null,created_at.lte.${dataFim}T23:59:59)`)
  }

  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ── Contas a pagar ─────────────────────────────────────────────

export async function getCategoriasContasPagar(tenantId) {
  const { data } = await supabase
    .from('contas_pagar').select('categoria').eq('tenant_id', tid(tenantId))
  const unique = [...new Set((data || []).map(r => r.categoria).filter(Boolean))].sort()
  return unique.length
    ? unique
    : ['Impulsionamento','Pro labore','Funcionario','Manutenção','Compras revenda','Compras',
       'Emprestimo','Despesas/Viagem','Despesas','Mercado','Imposto','Devolução cliente','Investimento']
}

export async function pagarContaPagar(id, dataPagamento) {
  const { error } = await supabase.from('contas_pagar')
    .update({ status: 'PAGO', data_pagamento: dataPagamento }).eq('id', id)
  if (error) throw error
}

export async function inserirContasPagarLote(tenantId, linhas) {
  const rows = linhas.map(({ id: _id, ...l }) => ({ ...l, tenant_id: tid(tenantId) }))
  const { error } = await supabase.from('contas_pagar').insert(rows)
  if (error) throw error
}

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
  // Aceita vírgula como separador decimal (padrão Brasil)
  const valorStr = String(credito.valor || '0').replace(',', '.')
  const valor = Number(valorStr) || 0
  if (credito.id) {
    const { error } = await supabase.from('creditos')
      .update({ cliente: credito.cliente || '', valor_original: valor, motivo: credito.observacao || 'Crédito da Loja' })
      .eq('id', credito.id)
    if (error) throw error
  } else {
    // Busca saldo anterior do cliente
    const { data: saldoData } = await supabase
      .from('creditos')
      .select('saldo_restante')
      .eq('tenant_id', tid(tenantId))
      .ilike('cliente', `%${(credito.cliente || '').trim()}%`)

    const saldoAnterior = (saldoData || []).reduce((sum, c) => sum + (Number(c.saldo_restante) || 0), 0)
    const saldoPosterior = saldoAnterior + valor

    // Insere o crédito
    const { data: creditoData, error } = await supabase.from('creditos').insert([{
      tenant_id:      tid(tenantId),
      cliente:        credito.cliente || '',
      valor_original: valor,
      saldo_restante: valor,
      valor_utilizado: 0,
      motivo:         credito.observacao || 'Crédito da Loja',
    }]).select('id').single()
    if (error) throw error

    // Registra no histórico
    await supabase.from('creditos_historico').insert([{
      tenant_id: tid(tenantId),
      credito_id: creditoData?.id,
      cliente: (credito.cliente || '').trim(),
      tipo: 'CREDITO',
      valor: valor,
      saldo_anterior: saldoAnterior,
      saldo_posterior: saldoPosterior,
      motivo: credito.observacao || 'Crédito da Loja'
    }])
  }
}

export async function excluirCredito(id) {
  const { error } = await supabase.from('creditos').delete().eq('id', id)
  if (error) throw error
}

// ── Dashboard: gráficos ────────────────────────────────────────

export async function getVendasPorAno(tenantId) {
  // Busca TODAS as vendas (mesma lógica do relatório)
  const { data, error } = await supabase
    .from('vendas')
    .select('preco, cliente_nome, data_live, created_at, status')
    .eq('tenant_id', tid(tenantId))

  if (error) throw error

  const map = {}
  ;(data || []).forEach(v => {
    // Filtra apenas vendas com cliente
    if (!(v.cliente_nome || '').trim()) return

    // Ignora CANCELADOS e DEVOLVIDOS
    const status = (v.status || '').toUpperCase()
    if (status === 'CANCELADO' || status === 'DEVOLVIDO') return

    // Usa data_live se disponível, senão usa created_at
    let dataVenda = v.data_live
    if (!dataVenda && v.created_at) {
      dataVenda = v.created_at.slice(0, 10)
    }
    if (!dataVenda) return

    const ano = dataVenda.slice(0, 4)
    map[ano] = (map[ano] || 0) + toNum(v.preco)
  })
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export async function getVendasPorMes(tenantId, ano) {
  const dataInicio = `${ano}-01-01`
  const dataFim = `${ano}-12-31`

  // Busca vendas do ano (mesma lógica do relatório)
  let q = supabase
    .from('vendas')
    .select('preco, cliente_nome, data_live, created_at, status')
    .eq('tenant_id', tid(tenantId))

  q = q.or(`and(data_live.gte.${dataInicio},data_live.lte.${dataFim}),and(data_live.is.null,created_at.gte.${dataInicio}T00:00:00,created_at.lte.${dataFim}T23:59:59)`)

  const { data, error} = await q
  if (error) throw error

  const map = {}
  ;(data || []).forEach(v => {
    // Filtra apenas vendas com cliente
    if (!(v.cliente_nome || '').trim()) return

    // Ignora CANCELADOS e DEVOLVIDOS
    const status = (v.status || '').toUpperCase()
    if (status === 'CANCELADO' || status === 'DEVOLVIDO') return

    // Usa data_live se disponível, senão usa created_at
    let dataVenda = v.data_live
    if (!dataVenda && v.created_at) {
      dataVenda = v.created_at.slice(0, 10)
    }
    if (!dataVenda) return

    const m = parseInt(dataVenda.slice(5, 7)) - 1
    map[m] = (map[m] || 0) + toNum(v.preco)
  })
  return Array.from({ length: 12 }, (_, i) => ({ label: MESES[i], value: map[i] || 0 }))
}

export async function getVendasPorDia(tenantId, ano, mes) {
  const dataInicio = `${ano}-${String(mes).padStart(2,'0')}-01`
  const ultimoDia  = new Date(ano, mes, 0).getDate()
  const dataFim    = `${ano}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`

  // Busca TODAS as vendas com paginação (Supabase limita a 1000 por página)
  let todasVendas = []
  let pagina = 0
  const TAMANHO_PAGINA = 1000

  while (true) {
    const { data, error } = await supabase
      .from('vendas')
      .select('preco, cliente_nome, data_live, created_at, status')
      .eq('tenant_id', tid(tenantId))
      .or(`and(data_live.gte.${dataInicio},data_live.lte.${dataFim}),and(data_live.is.null,created_at.gte.${dataInicio}T00:00:00,created_at.lte.${dataFim}T23:59:59)`)
      .range(pagina * TAMANHO_PAGINA, (pagina + 1) * TAMANHO_PAGINA - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    todasVendas = todasVendas.concat(data)
    if (data.length < TAMANHO_PAGINA) break // Última página
    pagina++
  }

  const map = {}
  ;(todasVendas || []).forEach(v => {
    // Filtra apenas vendas com cliente (vendidos)
    if (!(v.cliente_nome || '').trim()) return

    // Ignora CANCELADOS e DEVOLVIDOS
    const status = (v.status || '').toUpperCase()
    if (status === 'CANCELADO' || status === 'DEVOLVIDO') return

    // Usa data_live se disponível, senão usa created_at
    let dataVenda = v.data_live
    if (!dataVenda && v.created_at) {
      dataVenda = v.created_at.slice(0, 10)
    }
    if (!dataVenda) return

    const dia = dataVenda.slice(8, 10)
    map[dia] = (map[dia] || 0) + toNum(v.preco)
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

  // Busca vendas do mês (mesma lógica do relatório)
  let q = supabase
    .from('vendas')
    .select('preco, cliente_nome, data_live, created_at, status')
    .eq('tenant_id', tid(tenantId))

  q = q.or(`and(data_live.gte.${dataInicio},data_live.lte.${dataFim}),and(data_live.is.null,created_at.gte.${dataInicio}T00:00:00,created_at.lte.${dataFim}T23:59:59)`)

  const { data, error } = await q
  if (error) throw error

  const map = {}
  ;(data || []).forEach(v => {
    // Filtra apenas vendas com cliente
    const cli = (v.cliente_nome || '').trim()
    if (!cli) return

    // Ignora CANCELADOS e DEVOLVIDOS
    const status = (v.status || '').toUpperCase()
    if (status === 'CANCELADO' || status === 'DEVOLVIDO') return

    map[cli] = (map[cli] || 0) + toNum(v.preco)
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
    supabase.from('vendas').select('preco, cliente_nome, data_live, created_at, status')
      .eq('tenant_id', tid(tenantId))
      .or(`and(data_live.gte.${dataInicio},data_live.lte.${dataFim}),and(data_live.is.null,created_at.gte.${dataInicio}T00:00:00,created_at.lte.${dataFim}T23:59:59)`),
    supabase.from('contas_pagar').select('valor, data_pagamento, categoria')
      .eq('tenant_id', tid(tenantId))
      .gte('data_pagamento', dataInicio).lte('data_pagamento', dataFim)
      .eq('status', 'PAGO'),
  ])

  const vMap = {}, cMap = {}
  ;(vendasRes.data || []).forEach(v => {
    if (!(v.cliente_nome || '').trim()) return

    // Ignora vendas CANCELADAS e DEVOLVIDAS
    const status = (v.status || '').toUpperCase()
    if (status === 'CANCELADO' || status === 'DEVOLVIDO') return

    // Usa data_live se disponível, senão usa created_at
    let dataVenda = v.data_live
    if (!dataVenda && v.created_at) {
      dataVenda = v.created_at.slice(0, 10)
    }

    // Filtra pelo período
    if (!dataVenda || dataVenda < dataInicio || dataVenda > dataFim) return

    const d = dataVenda.slice(8, 10)
    vMap[d] = (vMap[d] || 0) + toNum(v.preco)
  })
  ;(contasRes.data || []).forEach(c => {
    const cat = (c.categoria || '').toUpperCase()
    if (!cat.includes('COMPRA') && !cat.includes('REVENDA')) return
    if (!c.data_pagamento) return
    const d = c.data_pagamento.slice(8, 10)
    cMap[d] = (cMap[d] || 0) + toNum(c.valor)
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
    eMap[d] = (eMap[d] || 0) + toNum(c.total)
  })
  ;(saiRes.data || []).forEach(c => {
    if (!c.data_pagamento) return
    const d = c.data_pagamento.slice(8, 10)
    sMap[d] = (sMap[d] || 0) + toNum(c.valor)
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
    supabase.from('vendas').select('preco, status, cliente_nome, data_live, created_at')
      .eq('tenant_id', tid(tenantId))
      .or(`and(data_live.gte.${dataInicio},data_live.lte.${dataFim}),and(data_live.is.null,created_at.gte.${dataInicio}T00:00:00,created_at.lte.${dataFim}T23:59:59)`),
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
    if (!(v.cliente_nome || '').trim()) return

    // Usa data_live se disponível, senão usa created_at
    let dataVenda = v.data_live
    if (!dataVenda && v.created_at) {
      dataVenda = v.created_at.slice(0, 10)
    }

    // Filtra pelo período
    if (!dataVenda || dataVenda < dataInicio || dataVenda > dataFim) return

    const val = toNum(v.preco)
    const st  = (v.status || '').toUpperCase()
    if (st === 'CANCELADO') cancelados += val
    else if (st === 'DEVOLVIDO') devolucoes += val
    else vendidoBruto += val
  })

  const totalCreditos = (credRes.data || []).reduce((s, c) => s + toNum(c.valor), 0)

  let fixasPagas = 0, varPagas = 0, fixasAP = 0, varAP = 0, proLabPago = 0, proLabAP = 0
  ;(contasRes.data || []).forEach(c => {
    const val  = toNum(c.valor)
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
    const val = toNum(c.total)
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
