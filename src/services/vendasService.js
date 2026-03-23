import { supabase } from '../lib/supabase'

const TENANT_ID = import.meta.env.VITE_TENANT_ID

function checkTenant() {
  if (!TENANT_ID) throw new Error('VITE_TENANT_ID não configurado no .env')
}

// ─── HELPERS ──────────────────────────────────────────────
function parseMoney(val) {
  if (!val && val !== 0) return null
  const n = parseFloat(val.toString().replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

export function formatMoney(val) {
  if (val === null || val === undefined || val === '') return ''
  const n = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : Number(val)
  if (isNaN(n)) return ''
  const parts = n.toFixed(2).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return parts.join(',')
}

// ─── DADOS INICIAIS (lives + bloqueados) ──────────────────
export async function getDadosIniciais() {
  checkTenant()

  const [livesRes, inadRes, bloqRes] = await Promise.all([
    supabase.from('lives').select('nome').eq('tenant_id', TENANT_ID).order('nome'),
    supabase
      .from('inadimplencias')
      .select('valor, data_referencia, clientes(instagram)')
      .eq('tenant_id', TENANT_ID)
      .eq('status', 'pendente'),
    supabase
      .from('clientes')
      .select('instagram, bloqueado, msg_bloqueio')
      .eq('tenant_id', TENANT_ID)
      .eq('bloqueado', true),
  ])

  const lives = (livesRes.data || []).map(l => l.nome)

  const bloqueados = {}

  ;(inadRes.data || []).forEach(i => {
    const nome = (i.clientes?.instagram || '').trim().toLowerCase()
    if (!nome) return
    if (!bloqueados[nome]) bloqueados[nome] = { dividas: [], manual: false, msgManual: '' }
    bloqueados[nome].dividas.push({
      data: i.data_referencia,
      valor: formatMoney(i.valor),
    })
  })

  ;(bloqRes.data || []).forEach(c => {
    const nome = (c.instagram || '').trim().toLowerCase()
    if (!nome) return
    if (!bloqueados[nome]) bloqueados[nome] = { dividas: [], manual: false, msgManual: '' }
    bloqueados[nome].manual = true
    bloqueados[nome].msgManual = c.msg_bloqueio || ''
  })

  return { lives, bloqueados }
}

// ─── LISTAS DE AUTOCOMPLETE ───────────────────────────────
export async function getListas() {
  checkTenant()

  const [pRes, mRes, cRes, marRes, cliRes] = await Promise.all([
    supabase.from('listas_produtos').select('nome').eq('tenant_id', TENANT_ID).order('nome'),
    supabase.from('listas_modelos').select('nome').eq('tenant_id', TENANT_ID).order('nome'),
    supabase.from('listas_cores').select('nome').eq('tenant_id', TENANT_ID).order('nome'),
    supabase.from('listas_marcas').select('nome').eq('tenant_id', TENANT_ID).order('nome'),
    supabase.from('clientes').select('instagram').eq('tenant_id', TENANT_ID).order('instagram'),
  ])

  return {
    produtos:  (pRes.data   || []).map(r => r.nome),
    modelos:   (mRes.data   || []).map(r => r.nome),
    cores:     (cRes.data   || []).map(r => r.nome),
    marcas:    (marRes.data || []).map(r => r.nome),
    clientes:  (cliRes.data || []).map(r => r.instagram),
  }
}

// ─── NOVO CADASTRO ────────────────────────────────────────
export async function salvarNovoCadastro(tipo, valor, whatsapp = '') {
  checkTenant()

  const tabelaMap = {
    produto: 'listas_produtos',
    modelo:  'listas_modelos',
    cor:     'listas_cores',
    marca:   'listas_marcas',
  }

  if (tipo === 'cliente') {
    const { error } = await supabase.from('clientes').insert({
      tenant_id: TENANT_ID,
      instagram: valor.trim(),
      whatsapp:  whatsapp.trim(),
    })
    if (error) throw error
    return { ok: true }
  }

  const tabela = tabelaMap[tipo]
  if (!tabela) throw new Error('Tipo inválido: ' + tipo)

  const { error } = await supabase.from(tabela).insert({
    tenant_id: TENANT_ID,
    nome: valor.trim(),
  })
  if (error) throw error
  return { ok: true }
}

// ─── BUSCAR VENDAS ────────────────────────────────────────
// Retorna pendentes (status='') e, se data+live informados,
// também as já enviadas da mesma sessão para exibir na tela.
export async function getVendas(dataLive = null, liveNome = null) {
  checkTenant()

  let query = supabase
    .from('vendas')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: true })

  if (dataLive && liveNome) {
    // Mostra tudo da live (pendentes + enviadas individualmente)
    query = query.or(`status.eq.,and(data_live.eq.${dataLive},live_nome.eq.${liveNome})`)
  } else {
    query = query.eq('status', '')
    if (dataLive)  query = query.eq('data_live', dataLive)
    if (liveNome)  query = query.eq('live_nome', liveNome)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

// ─── SALVAR VENDAS (upsert) ───────────────────────────────
export async function salvarVendas(linhas, defaults = {}) {
  checkTenant()

  const paraInsert = []
  const paraUpdate = []
  const paraDelete = []

  for (const l of linhas) {
    if (l.isSent) continue

    if (l.deleted) {
      if (l.id) paraDelete.push(l.id)
      continue
    }

    // Ignora linhas vazias novas
    if (!l.id && !l.produto && !l.codigo && !l.preco && !l.cliente_nome) continue

    const row = {
      tenant_id:    TENANT_ID,
      produto:      l.produto      || '',
      modelo:       l.modelo       || '',
      cor:          l.cor          || '',
      marca:        l.marca        || '',
      tamanho:      l.tamanho      || '',
      preco:        parseMoney(l.preco),
      codigo:       l.codigo       || '',
      cliente_nome: l.cliente_nome || '',
      data_live:    l.data_live    || defaults.data_live || null,
      live_nome:    l.live_nome    || defaults.live_nome || '',
      sacolinha:    l.sacolinha    || null,
      status:       '',
      fila1:        l.fila1        || '',
      fila2:        l.fila2        || '',
      fila3:        l.fila3        || '',
    }

    if (l.id) {
      paraUpdate.push({ id: l.id, ...row })
    } else {
      paraInsert.push(row)
    }
  }

  const ops = []

  if (paraDelete.length)
    ops.push(supabase.from('vendas').delete().in('id', paraDelete).eq('tenant_id', TENANT_ID))

  let insertedIds = []
  if (paraInsert.length) {
    const { data, error } = await supabase.from('vendas').insert(paraInsert).select('id')
    if (error) throw error
    insertedIds = (data || []).map(r => r.id)
  }

  if (paraUpdate.length) {
    const { error } = await supabase
      .from('vendas')
      .upsert(paraUpdate, { onConflict: 'id' })
    if (error) throw error
  }

  await Promise.all(ops)

  return { ok: true, insertedIds }
}

// ─── ENVIAR VENDA INDIVIDUAL ──────────────────────────────
export async function enviarVenda(linha, dataLive, liveNome) {
  checkTenant()

  if (linha.id) {
    const { error } = await supabase
      .from('vendas')
      .update({
        status:     'ENVIADO',
        tipo_envio: 'individual',
        data_live:  dataLive || null,
        live_nome:  liveNome || '',
        preco:      parseMoney(linha.preco),
      })
      .eq('id', linha.id)
      .eq('tenant_id', TENANT_ID)
    if (error) throw error
    return { ok: true, id: linha.id }
  }

  // Linha ainda não estava salva no banco → insere já como ENVIADO
  const { data, error } = await supabase
    .from('vendas')
    .insert({
      tenant_id:    TENANT_ID,
      produto:      linha.produto      || '',
      modelo:       linha.modelo       || '',
      cor:          linha.cor          || '',
      marca:        linha.marca        || '',
      tamanho:      linha.tamanho      || '',
      preco:        parseMoney(linha.preco),
      codigo:       linha.codigo       || '',
      cliente_nome: linha.cliente_nome || '',
      data_live:    dataLive           || null,
      live_nome:    liveNome           || '',
      sacolinha:    linha.sacolinha    || null,
      status:       'ENVIADO',
      tipo_envio:   'individual',
      fila1:        linha.fila1        || '',
      fila2:        linha.fila2        || '',
      fila3:        linha.fila3        || '',
    })
    .select('id')
    .single()
  if (error) throw error
  return { ok: true, id: data.id }
}

// ─── ESTORNAR VENDA ───────────────────────────────────────
export async function estornarVenda(id) {
  checkTenant()
  const { error } = await supabase
    .from('vendas')
    .update({ status: '', tipo_envio: '' })
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
  if (error) throw error
  return { ok: true }
}

// ─── FINALIZAR LIVE (envio em lote) ──────────────────────
export async function finalizarLive(linhas, dataLive, liveNome) {
  checkTenant()

  // 1. Salva todas as alterações pendentes com data+live da sessão
  await salvarVendas(linhas, { data_live: dataLive, live_nome: liveNome })

  // 2. Marca como ENVIADO todas as pendentes com cliente da live atual
  const { data, error } = await supabase
    .from('vendas')
    .update({ status: 'ENVIADO', tipo_envio: 'lote' })
    .eq('tenant_id', TENANT_ID)
    .eq('status', '')
    .eq('live_nome', liveNome)
    .eq('data_live', dataLive)
    .neq('cliente_nome', '')
    .select('id')

  if (error) throw error
  return { ok: true, movidos: (data || []).length }
}
