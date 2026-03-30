import { supabase } from '../lib/supabase'

// tenantId lido do .env — sem precisar passar como parâmetro em todo lugar
const TENANT_ID = () => import.meta.env.VITE_TENANT_ID

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
export async function getDadosIniciais() {
  const tenantId = TENANT_ID()
  const [livesRes, bloqRes, inadRes] = await Promise.all([
    supabase.from('lives').select('nome').eq('tenant_id', tenantId).order('nome'),
    supabase.from('clientes').select('instagram, bloqueado, msg_bloqueio')
      .eq('tenant_id', tenantId).eq('bloqueado', true),
    supabase.from('inadimplencias')
      .select('valor, data_referencia, clientes(instagram)')
      .eq('tenant_id', tenantId).eq('status', 'pendente'),
  ])

  const lives = livesRes.data?.map(l => l.nome) || []
  const bloqueados = {}

  bloqRes.data?.forEach(c => {
    const key = c.instagram.toLowerCase()
    if (!bloqueados[key]) bloqueados[key] = { dividas: [], manual: false, msgManual: '' }
    bloqueados[key].manual    = true
    bloqueados[key].msgManual = c.msg_bloqueio || ''
  })

  inadRes.data?.forEach(i => {
    const key = i.clientes?.instagram?.toLowerCase()
    if (!key) return
    if (!bloqueados[key]) bloqueados[key] = { dividas: [], manual: false, msgManual: '' }
    bloqueados[key].dividas.push({
      data:  i.data_referencia || '',
      valor: i.valor != null ? formatMoney(i.valor) : '',
    })
  })

  return { lives, bloqueados }
}

// ── getListas (alias: getListasAutocomplete) ───────────────────
export async function getListas() {
  const tenantId = TENANT_ID()
  const [prod, mod, cor, marc, cli] = await Promise.all([
    supabase.from('listas_produtos').select('nome').eq('tenant_id', tenantId).order('nome'),
    supabase.from('listas_modelos') .select('nome').eq('tenant_id', tenantId).order('nome'),
    supabase.from('listas_cores')   .select('nome').eq('tenant_id', tenantId).order('nome'),
    supabase.from('listas_marcas')  .select('nome').eq('tenant_id', tenantId).order('nome'),
    supabase.from('clientes')       .select('instagram').eq('tenant_id', tenantId).order('instagram'),
  ])
  return {
    produtos: prod.data?.map(r => r.nome)     || [],
    modelos:  mod.data?.map(r => r.nome)      || [],
    cores:    cor.data?.map(r => r.nome)      || [],
    marcas:   marc.data?.map(r => r.nome)     || [],
    clientes: cli.data?.map(r => r.instagram) || [],
  }
}
export { getListas as getListasAutocomplete }

// ── salvarNovoCadastro ─────────────────────────────────────────
export async function salvarNovoCadastro(tipo, valor, celular) {
  const tenantId = TENANT_ID()
  const nome = valor.trim()
  if (!nome) throw new Error('Valor em branco.')

  if (tipo === 'cliente') {
    if (!celular?.trim()) throw new Error('Preencha o WhatsApp.')
    const { error } = await supabase.from('clientes').insert({
      tenant_id: tenantId, instagram: nome, whatsapp: celular.trim(),
    })
    if (error) {
      if (error.code === '23505') throw new Error('Cliente já cadastrado.')
      throw error
    }
    return { ok: true }
  }

  const tabela = { produto:'listas_produtos', modelo:'listas_modelos', cor:'listas_cores', marca:'listas_marcas' }[tipo]
  if (!tabela) throw new Error('Tipo inválido.')
  const { error } = await supabase.from(tabela).insert({ tenant_id: tenantId, nome })
  if (error) {
    if (error.code === '23505') throw new Error(`${tipo} já cadastrado.`)
    throw error
  }
  return { ok: true }
}

// ── getVendas ──────────────────────────────────────────────────
export async function getVendas(dataLive, liveNome) {
  const tenantId = TENANT_ID()
  let query = supabase
    .from('vendas').select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (dataLive)         query = query.eq('data_live', dataLive)
  if (liveNome?.trim()) query = query.eq('live_nome', liveNome.trim())

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(row => ({
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

// ── salvarVendas ───────────────────────────────────────────────
// Aceita: salvarVendas(linhas, dataLive, liveNome)
//     ou: salvarVendas(linhas, { data_live, live_nome })
export async function salvarVendas(linhas, dataLiveOrOpts, liveNomeArg) {
  const tenantId = TENANT_ID()
  const dataLive = (typeof dataLiveOrOpts === 'object' && dataLiveOrOpts)
    ? dataLiveOrOpts.data_live : dataLiveOrOpts
  const liveNome = (typeof dataLiveOrOpts === 'object' && dataLiveOrOpts)
    ? dataLiveOrOpts.live_nome : liveNomeArg

  const toUpsert = []; const toDelete = []
  linhas.forEach(l => {
    if (l.deleted || l.isDeleted) { if (l.id) toDelete.push(l.id); return }
    if (l.isSent) return
    if (!l.produto && !l.codigo && !l.preco && !l.cliente_nome) return
    toUpsert.push({
      ...(l.id ? { id: l.id } : {}),
      tenant_id: tenantId,
      produto: l.produto || '', modelo: l.modelo || '', cor: l.cor || '',
      marca: l.marca || '', tamanho: l.tamanho || '',
      preco: parseMoney(l.preco), codigo: l.codigo || '',
      cliente_nome: l.cliente_nome || '',
      data_live: dataLive || null, live_nome: liveNome || '',
      sacolinha: l.sacolinha ?? null, status: l.status || '',
      fila1: l.fila1 || '', fila2: l.fila2 || '', fila3: l.fila3 || '',
    })
  })

  let novosIds = []
  if (toUpsert.length > 0) {
    const { data, error } = await supabase.from('vendas')
      .upsert(toUpsert, { onConflict: 'id' }).select('id')
    if (error) throw error
    novosIds = data || []
  }
  if (toDelete.length > 0) {
    const { error } = await supabase.from('vendas').delete().in('id', toDelete)
    if (error) throw error
  }
  return { ok: true, novosIds }
}

// ── enviarVenda (alias: enviarVendaIndividual) ─────────────────
export async function enviarVenda(linha, dataLive, liveNome) {
  const tenantId = TENANT_ID()
  if (linha.id) {
    const { error } = await supabase.from('vendas')
      .update({ status: 'ENVIADO', tipo_envio: 'individual', data_live: dataLive, live_nome: liveNome })
      .eq('id', linha.id)
    if (error) throw error
    return { ok: true, id: linha.id }
  }
  const { data, error } = await supabase.from('vendas').insert({
    tenant_id: tenantId,
    produto: linha.produto || '', modelo: linha.modelo || '', cor: linha.cor || '',
    marca: linha.marca || '', tamanho: linha.tamanho || '',
    preco: parseMoney(linha.preco), codigo: linha.codigo || '',
    cliente_nome: linha.cliente_nome || '',
    data_live: dataLive || null, live_nome: liveNome || '',
    sacolinha: linha.sacolinha ?? null,
    status: 'ENVIADO', tipo_envio: 'individual',
    fila1: linha.fila1 || '', fila2: linha.fila2 || '', fila3: linha.fila3 || '',
  }).select('id').single()
  if (error) throw error
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

// ── finalizarLive ──────────────────────────────────────────────
export async function finalizarLive(linhas, dataLive, liveNome) {
  const tenantId = TENANT_ID()
  await salvarVendas(linhas, dataLive, liveNome)
  const { data, error } = await supabase.from('vendas')
    .update({ status: 'ENVIADO', tipo_envio: 'lote', data_live: dataLive, live_nome: liveNome })
    .eq('tenant_id', tenantId).eq('status', '').neq('cliente_nome', '')
    .eq('live_nome', liveNome || '')
    .select('id')
  if (error) throw error
  return { ok: true, movidos: (data || []).length }
}
