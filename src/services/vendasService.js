import { supabase } from '../lib/supabase'

// tenantId enviado pelo app, com fallback para .env para compatibilidade
const TENANT_ID = (tenantId) => tenantId || import.meta.env.VITE_TENANT_ID

// ── Utilitários de formatação ──────────────────────────────────
export function formatMoney(val) {
  if (!val && val !== 0) return ''
  const num = typeof val === 'string'
    ? parseFloat(val.replace(/\./g, '').replace(',', '.'))
    : Number(val)
  if (isNaN(num)) return String(val)
  return num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function parseMoney(str) {
  if (!str) return null
  const num = parseFloat(String(str).replace(/\./g, '').replace(',', '.'))
  return isNaN(num) ? null : num
}

// ── getDadosIniciais ───────────────────────────────────────────
function safeQuery(promise) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve({ data: [] }), 6000)),
  ]).catch(() => ({ data: [] }))
}

export async function getDadosIniciais(tenantId = null) {
  const tid = TENANT_ID(tenantId)

  // Função auxiliar para buscar TUDO com paginação
  const fetchAllPaginated = async (query) => {
    let todos = []
    let pag = 0
    const LOTE = 1000

    while (true) {
      const { data } = await query.range(pag * LOTE, (pag + 1) * LOTE - 1)
      if (!data || data.length === 0) break
      todos = todos.concat(data)
      if (data.length < LOTE) break
      pag++
    }
    return { data: todos }
  }

  const [livesTableRes, bloqRes, cobRes] = await Promise.all([
    // 🚀 OTIMIZADO: Busca SOMENTE da tabela lives (auto-populada ao salvar vendas)
    safeQuery(supabase
      .from('lives')
      .select('nome')
      .eq('tenant_id', tid)
      .order('nome')),
    safeQuery(fetchAllPaginated(supabase.from('clientes').select('instagram, bloqueado, msg_bloqueio')
      .eq('tenant_id', tid).eq('bloqueado', true))),
    // Cobrancas pendentes = dívidas ativas do cliente
    safeQuery(supabase.from('cobrancas')
      .select('cliente, total, data')
      .eq('tenant_id', tid)
      .in('status', ['PENDENTE', 'ENVIADO', 'REENVIADO', 'LEMBRETE'])),
  ])

  // Lives vem direto da tabela otimizada
  const lives = (livesTableRes.data?.map(l => l.nome).filter(Boolean) || []).sort()
  const bloqueados = {}

  bloqRes.data?.forEach(c => {
    const key = (c.instagram || '').toLowerCase()
    if (!key) return
    if (!bloqueados[key]) bloqueados[key] = { dividas: [], manual: false, msgManual: '' }
    bloqueados[key].manual    = true
    bloqueados[key].msgManual = c.msg_bloqueio || ''
  })

  cobRes.data?.forEach(c => {
    const key = (c.cliente || '').toLowerCase()
    if (!key) return
    if (!bloqueados[key]) bloqueados[key] = { dividas: [], manual: false, msgManual: '' }
    bloqueados[key].dividas.push({
      data:  c.data || '',
      valor: c.total != null ? formatMoney(c.total) : '',
    })
  })

  return { lives, bloqueados }
}

// ── getListas (alias: getListasAutocomplete) ───────────────────
export async function getListas(tenantId = null) {
  const tid = TENANT_ID(tenantId)

  // 🔥 PAGINAÇÃO: Supabase tem limite MÁXIMO de 1000 por query!
  // Solução: Buscar em chunks de 1000 (parallel)
  const fetchAll = async (table, column) => {
    const [p1, p2, p3, p4, p5] = await Promise.all([
      supabase.from(table).select(column).eq('tenant_id', tid).order(column).range(0, 999),
      supabase.from(table).select(column).eq('tenant_id', tid).order(column).range(1000, 1999),
      supabase.from(table).select(column).eq('tenant_id', tid).order(column).range(2000, 2999),
      supabase.from(table).select(column).eq('tenant_id', tid).order(column).range(3000, 3999),
      supabase.from(table).select(column).eq('tenant_id', tid).order(column).range(4000, 4999),
    ])
    const all = [...(p1.data || []), ...(p2.data || []), ...(p3.data || []), ...(p4.data || []), ...(p5.data || [])]
    console.log(`📦 ${table}:`, { p1: p1.data?.length || 0, p2: p2.data?.length || 0, p3: p3.data?.length || 0, total: all.length })
    return all
  }

  const [prod, mod, cor, marc, cli] = await Promise.all([
    fetchAll('listas_produtos', 'nome'),
    fetchAll('listas_modelos', 'nome'),
    fetchAll('listas_cores', 'nome'),
    fetchAll('listas_marcas', 'nome'),
    fetchAll('clientes', 'instagram'),
  ])
  return {
    produtos: prod.map(r => r.nome),
    modelos:  mod.map(r => r.nome),
    cores:    cor.map(r => r.nome),
    marcas:   marc.map(r => r.nome),
    clientes: cli.map(r => r.instagram),
  }
}
export { getListas as getListasAutocomplete }

// ── salvarNovaLive ─────────────────────────────────────────────
export async function salvarNovaLive(tenantId = null, nomeLive) {
  const tid = TENANT_ID(tenantId)
  const nome = nomeLive.trim()
  if (!nome) throw new Error('Nome da live em branco.')

  // Verifica se já existe
  const { data: existe } = await supabase
    .from('lives')
    .select('id')
    .eq('tenant_id', tid)
    .eq('nome', nome)
    .maybeSingle()

  if (existe) {
    console.log('Live já existe:', nome)
    return // Não é erro, apenas já existe
  }

  const { error } = await supabase
    .from('lives')
    .insert([{ tenant_id: tid, nome }])

  if (error) throw error
  console.log('✅ Live salva:', nome)
}

// ── salvarNovoCadastro ─────────────────────────────────────────
export async function salvarNovoCadastro(tenantId = null, tipo, valor, celular) {
  const tid = TENANT_ID(tenantId)
  const nome = valor.trim()
  if (!nome) throw new Error('Valor em branco.')

  if (tipo === 'cliente') {
    if (!celular?.trim()) throw new Error('Preencha o WhatsApp.')
    const { error } = await supabase.from('clientes').insert({
      tenant_id: tid, instagram: nome, whatsapp: celular.trim(),
    })
    if (error) {
      if (error.code === '23505') throw new Error('Cliente já cadastrado.')
      throw error
    }
    return { ok: true }
  }

  const tabela = { produto:'listas_produtos', modelo:'listas_modelos', cor:'listas_cores', marca:'listas_marcas' }[tipo]
  if (!tabela) throw new Error('Tipo inválido.')
  const { error } = await supabase.from(tabela).insert({ tenant_id: tid, nome })
  if (error) {
    if (error.code === '23505') throw new Error(`${tipo} já cadastrado.`)
    throw error
  }
  return { ok: true }
}

// ── getVendas ──────────────────────────────────────────────────
export async function getVendas(tenantId = null, dataLive, liveNome, opts = {}) {
  const tid = TENANT_ID(tenantId)
  const somentePendentes = opts?.somentePendentes ?? false
  let query = supabase
    .from('vendas').select('*')
    .eq('tenant_id', tid)
    .order('id', { ascending: true })  // ✅ Ordena por ID (sequencial, garante ordem exata)

  if (dataLive)         query = query.eq('data_live', dataLive)
  if (liveNome?.trim()) query = query.eq('live_nome', liveNome.trim())

  const { data, error } = await query
  if (error) throw error
  let rows = data || []

  // ✅ Filtra linhas deletadas (não retorna do banco)
  rows = rows.filter(row => !row.deleted)

  if (somentePendentes) {
    rows = rows.filter(row => String(row.status || '').trim().toUpperCase() !== 'ENVIADO')
  }
  // semCliente: retorna apenas itens sem cliente (produto cadastrado, ainda não vendido)
  if (opts?.semCliente) {
    rows = rows.filter(row => !row.cliente_nome?.trim())
  }
  // apenasComCliente: retorna apenas itens COM cliente (incluindo os enviados)
  // As linhas enviadas (aviãozinho) continuam aparecendo até clicar em "Salvar"
  if (opts?.apenasComCliente) {
    rows = rows.filter(row => row.cliente_nome?.trim())
  }

  return rows.map(row => ({
    _key: row.id, id: row.id,
    produto:      row.produto      || '',
    modelo:       row.modelo       || '',
    cor:          row.cor          || '',
    marca:        row.marca        || '',
    tamanho:      row.tamanho      || '',
    preco:        row.preco != null ? formatMoney(row.preco) : '',
    codigo:       row.codigo       || '',
    cliente_nome: row.cliente_nome || '',
    data_live:    row.data_live    || '',
    live_nome:    row.live_nome    || '',
    sacolinha:    row.sacolinha    ?? null,
    status:       row.status       || '',
    fila1:        row.fila1        || '',
    fila2:        row.fila2        || '',
    fila3:        row.fila3        || '',
    isNew: false, deleted: false,
    isSent: (row.status || '').toUpperCase() === 'ENVIADO',
    liberado: false,
  }))
}

// ── buscarProdutosPorTermos ────────────────────────────────────
// Busca produtos únicos na tabela vendas baseado em termos de busca
// ✅ Busca APENAS da live atual (data_live + live_nome)
export async function buscarProdutosPorTermos(tenantId = null, termosStr, dataLive, liveNome) {
  const tid = TENANT_ID(tenantId)
  console.log('🔍 buscarProdutosPorTermos chamada:', { termosStr, dataLive, liveNome, tid })
  if (!termosStr?.trim()) return []

  const termos = termosStr.toLowerCase().split(',').map(t => t.trim()).filter(Boolean)
  console.log('📝 Termos de busca:', termos)
  if (termos.length === 0) return []

  // ✅ Busca APENAS produtos da live atual (data_live + live_nome)
  let query = supabase
    .from('vendas')
    .select('id, produto, modelo, cor, marca, tamanho, preco, codigo, cliente_nome, sacolinha')
    .eq('tenant_id', tid)
    .order('created_at', { ascending: false })
    .limit(500)

  // ✅ Filtra por data e live (APENAS live atual!)
  if (dataLive) query = query.eq('data_live', dataLive)
  if (liveNome?.trim()) query = query.eq('live_nome', liveNome.trim())

  const { data: vendas, error } = await query

  console.log('📦 Vendas retornadas do banco:', vendas?.length || 0)
  if (error) { console.error('❌ Erro ao buscar:', error); throw error }
  if (!vendas?.length) return []

  // ✅ Filtra produtos que correspondem a TODOS os termos (COM OU SEM cliente)
  const produtos = vendas.filter(v => {
    const txt = [v.produto, v.modelo, v.cor, v.marca, v.tamanho, v.codigo, v.cliente_nome || '']
      .join(' ')
      .toLowerCase()
    const match = termos.every(termo => txt.includes(termo))
    if (match) console.log('✅ Match encontrado:', v)
    return match
  })

  console.log('🎯 Produtos após filtro:', produtos.length)

  // ✅ Retorna produtos DO BANCO (preserva ID, cliente e sacolinha)
  const resultado = produtos.map(p => ({
    _key: `busca-${p.id || Date.now()}-${Math.random()}`,
    id: p.id || null,
    produto: p.produto || '',
    modelo: p.modelo || '',
    cor: p.cor || '',
    marca: p.marca || '',
    tamanho: p.tamanho || '',
    preco: p.preco != null ? formatMoney(p.preco) : '',
    codigo: p.codigo || '',
    cliente_nome: p.cliente_nome || '',  // ✅ Preserva cliente original!
    data_live: dataLive || '',
    live_nome: liveNome || '',
    sacolinha: p.sacolinha || null,  // ✅ Preserva sacolinha original!
    status: '',
    fila1: '', fila2: '', fila3: '',
    isNew: false,  // ✅ Produto do banco não é novo
    deleted: false,
    isSent: false,
    liberado: false,
    _fromSearch: true, // ✅ Flag para identificar que veio da busca do filtro
  }))

  console.log('✨ Resultado final da busca:', resultado.length, 'produtos')
  return resultado
}

// ── salvarVendas ───────────────────────────────────────────────
// Aceita: salvarVendas(linhas, dataLive, liveNome)
//     ou: salvarVendas(linhas, { data_live, live_nome })
export async function salvarVendas(tenantId = null, linhas, dataLiveOrOpts, liveNomeArg) {
  const tid = TENANT_ID(tenantId)
  const dataLive = (typeof dataLiveOrOpts === 'object' && dataLiveOrOpts)
    ? dataLiveOrOpts.data_live : dataLiveOrOpts
  const liveNome = (typeof dataLiveOrOpts === 'object' && dataLiveOrOpts)
    ? dataLiveOrOpts.live_nome : liveNomeArg

  const toInsert = []
  const toUpdate = []
  const toDelete = []
  const idsVistos = new Set()

  linhas.forEach(l => {
    if (l.deleted || l.isDeleted) { if (l.id) toDelete.push(l.id); return }
    if (l.isSent) return
    
    // Exige pelo menos um campo de produto para salvar — linha com só cliente não é salva
    const temProduto = !!(
      (l.produto || '').trim() ||
      (l.modelo || '').trim() ||
      (l.cor || '').trim() ||
      (l.marca || '').trim() ||
      (l.tamanho || '').trim() ||
      (l.preco || '').trim() ||
      (l.codigo || '').trim()
    )
    if (!temProduto) return

    const row = {
      tenant_id: tid,
      produto: l.produto || '', modelo: l.modelo || '', cor: l.cor || '',
      marca: l.marca || '', tamanho: l.tamanho || '',
      preco: parseMoney(l.preco),
      preco_promocional: parseMoney(l.preco_promocional),
      codigo: l.codigo || '',
      cliente_nome: l.cliente_nome || '',
      data_live: dataLive || null, live_nome: liveNome || '',
      sacolinha: l.sacolinha ?? null, status: l.status || '',
      fila1: l.fila1 || '', fila2: l.fila2 || '', fila3: l.fila3 || '',
    }

    if (l.id) {
      if (idsVistos.has(l.id)) return // Pula se o ID já foi processado nesta leva
      idsVistos.add(l.id)
      row.id = l.id
      toUpdate.push(row)
    } else {
      toInsert.push(row)
    }
  })

  let novosIds = []
  if (toInsert.length > 0) {
    const { data, error } = await supabase.from('vendas')
      .insert(toInsert).select('id')
    if (error) throw error
    novosIds = data || []   // apenas IDs de novas linhas inseridas
  }
  if (toUpdate.length > 0) {
    const { error } = await supabase.from('vendas')
      .upsert(toUpdate, { onConflict: 'id' })
    if (error) throw error
    // IDs do upsert NÃO são adicionados a novosIds — as linhas já têm seus IDs no state
  }
  if (toDelete.length > 0) {
    const { error } = await supabase.from('vendas').delete().in('id', toDelete)
    if (error) throw error
  }

  // 🚀 AUTO-POPULAR TABELA LIVES (otimização de performance)
  if (liveNome && liveNome.trim()) {
    try {
      await salvarNovaLive(tenantId, liveNome.trim())
    } catch {
      // Silenciosamente ignora erro (live já existe ou outro problema não crítico)
    }
  }

  return { ok: true, novosIds }
}

// ── enviarVenda (alias: enviarVendaIndividual) ─────────────────
export async function enviarVenda(tenantId = null, linha, dataLive, liveNome) {
  const tid = TENANT_ID(tenantId)
  if (linha.id) {
    const { error } = await supabase.from('vendas')
      .update({
        status: 'ENVIADO',
        tipo_envio: 'individual',
        data_live: dataLive,
        live_nome: liveNome,
        cliente_nome: linha.cliente_nome || '',
        preco: parseMoney(linha.preco),
        preco_promocional: parseMoney(linha.preco_promocional),
        produto: linha.produto || '',
        modelo: linha.modelo || '',
        cor: linha.cor || '',
        marca: linha.marca || '',
        tamanho: linha.tamanho || '',
        codigo: linha.codigo || '',
        sacolinha: linha.sacolinha ?? null
      })
      .eq('id', linha.id)
    if (error) throw error

    // Auto-popular lives
    if (liveNome && liveNome.trim()) {
      try { await salvarNovaLive(tenantId, liveNome.trim()) } catch {}
    }

    return { ok: true, id: linha.id }
  }
  const { data, error } = await supabase.from('vendas').insert({
    tenant_id: tid,
    produto: linha.produto || '', modelo: linha.modelo || '', cor: linha.cor || '',
    marca: linha.marca || '', tamanho: linha.tamanho || '',
    preco: parseMoney(linha.preco),
    preco_promocional: parseMoney(linha.preco_promocional),
    codigo: linha.codigo || '',
    cliente_nome: linha.cliente_nome || '',
    data_live: dataLive || null, live_nome: liveNome || '',
    sacolinha: linha.sacolinha ?? null,
    status: 'ENVIADO', tipo_envio: 'individual',
    fila1: linha.fila1 || '', fila2: linha.fila2 || '', fila3: linha.fila3 || '',
  }).select('id').single()
  if (error) throw error

  // Auto-popular lives
  if (liveNome && liveNome.trim()) {
    try { await salvarNovaLive(tenantId, liveNome.trim()) } catch {}
  }

  return { ok: true, id: data.id }
}
export { enviarVenda as enviarVendaIndividual }

// ── estornarVenda ──────────────────────────────────────────────
export async function estornarVenda(id) {
  const { error } = await supabase.from('vendas')
    .update({ status: '', tipo_envio: '' }).eq('id', id)
  if (error) throw error
  return { ok: true }
}

// ── excluirVenda ───────────────────────────────────────────────
export async function excluirVenda(id) {
  const { error } = await supabase.from('vendas').delete().eq('id', id)
  if (error) throw error
  return { ok: true }
}

// ── getVendasEnviadas ──────────────────────────────────────────
export async function getVendasEnviadas(tenantId = null, filtros = {}) {
  const tid = TENANT_ID(tenantId)
  const { dataInicio, dataFim, clienteNome } = filtros

  let query = supabase
    .from('vendas')
    .select('*')
    .eq('tenant_id', tid)
    .eq('status', 'ENVIADO')
    .order('data_live', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300)

  if (dataInicio)         query = query.gte('data_live', dataInicio)
  if (dataFim)            query = query.lte('data_live', dataFim)
  if (clienteNome?.trim()) query = query.ilike('cliente_nome', `%${clienteNome.trim()}%`)

  const { data, error } = await query
  if (error) throw error

  return (data || []).map(row => ({
    _key: row.id, id: row.id,
    produto: row.produto || '', modelo: row.modelo || '', cor: row.cor || '',
    marca: row.marca || '', tamanho: row.tamanho || '',
    preco: row.preco != null ? formatMoney(row.preco) : '',
    codigo: row.codigo || '', cliente_nome: row.cliente_nome || '',
    data_live: row.data_live || '', live_nome: row.live_nome || '',
    sacolinha: row.sacolinha ?? null, status: row.status || '',
    fila1: row.fila1 || '', fila2: row.fila2 || '', fila3: row.fila3 || '',
    isNew: false, deleted: false, isSent: true, liberado: false,
  }))
}

// ── updateVendaEnviada ─────────────────────────────────────────
export async function updateVendaEnviada(tenantId = null, linha) {
  const tid = TENANT_ID(tenantId)
  const { error } = await supabase
    .from('vendas')
    .update({
      produto:           linha.produto      || '',
      modelo:            linha.modelo       || '',
      cor:               linha.cor          || '',
      marca:             linha.marca        || '',
      tamanho:           linha.tamanho      || '',
      preco:             parseMoney(linha.preco),
      preco_promocional: parseMoney(linha.preco_promocional),
      codigo:            linha.codigo       || '',
      cliente_nome:      linha.cliente_nome || '',
    })
    .eq('id', linha.id)
    .eq('tenant_id', tid)
  if (error) throw error
  return { ok: true }
}

// ── finalizarLive ──────────────────────────────────────────────
export async function finalizarLive(tenantId = null, linhas, dataLive, liveNome) {
  const tid = TENANT_ID(tenantId)

  // 1) Salva/atualiza todas as linhas (inclusive novas) com data e live corretos
  await salvarVendas(tenantId, linhas, dataLive, liveNome)

  // 2) Busca no banco todas as linhas COM cliente pendentes nessa data+live
  //    (inclui linhas recém-inseridas que ainda não tinham id no state)
  const { data: comCliente, error: qErr } = await supabase
    .from('vendas')
    .select('id')
    .eq('tenant_id', tid)
    .eq('data_live', dataLive)
    .eq('live_nome', liveNome || '')
    .eq('status', '')
    .neq('cliente_nome', '')
  if (qErr) throw qErr

  const ids = (comCliente || []).map(r => r.id)
  if (ids.length === 0) return { ok: true, movidos: 0 }

  // 3) Marca todas como ENVIADO em lote
  const { data, error } = await supabase
    .from('vendas')
    .update({ status: 'ENVIADO', tipo_envio: 'lote' })
    .in('id', ids)
    .eq('tenant_id', tid)
    .select('id')
  if (error) throw error
  return { ok: true, movidos: (data || []).length }
}
