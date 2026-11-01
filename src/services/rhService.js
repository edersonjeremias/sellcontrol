import { supabase } from '../lib/supabase'

const tid = (tenantId) => tenantId || import.meta.env.VITE_TENANT_ID

// Tabela ainda não criada no banco — a tela mostra o aviso de migração
// em vez de estourar um erro em cima do usuário.
export function tabelaFalta(error) {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' ||
    error.message?.includes('does not exist') || error.message?.includes('schema cache')
}

// ── Helpers de formatação ──────────────────────────────────────
export function fmtR(val) {
  const n = Number(val) || 0
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// yyyy-mm-dd no fuso local. toISOString() devolve o dia seguinte à noite,
// porque converte para UTC e o Brasil fica atrás dele.
export function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function fmtDataCurta(iso) {
  if (!iso) return ''
  const [, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}`
}

export function parseValor(s) {
  if (typeof s === 'number') return s
  if (!s) return 0
  return parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0
}

// Máscara de digitação: "1250" → "12,50"
export function mascaraValor(s) {
  let v = String(s).replace(/\D/g, '')
  if (!v) return ''
  v = (parseInt(v, 10) / 100).toFixed(2)
  return v.replace('.', ',').replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.')
}

// Número → texto do input ("12.5" → "12,50")
export function valorParaInput(n) {
  const v = Number(n) || 0
  if (!v) return ''
  return mascaraValor(String(Math.round(v * 100)))
}

export function mascaraTelefone(s) {
  const v = String(s || '').replace(/\D/g, '').slice(0, 11)
  if (v.length <= 2)  return v
  if (v.length <= 6)  return `(${v.slice(0,2)}) ${v.slice(2)}`
  if (v.length <= 10) return `(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`
  return `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`
}

export function mascaraCpf(s) {
  const v = String(s || '').replace(/\D/g, '').slice(0, 11)
  if (v.length <= 3)  return v
  if (v.length <= 6)  return `${v.slice(0,3)}.${v.slice(3)}`
  if (v.length <= 9)  return `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6)}`
  return `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`
}

export function primeiroDiaMes(ref = new Date()) {
  return `${ref.getFullYear()}-${String(ref.getMonth()+1).padStart(2,'0')}-01`
}

export function ultimoDiaMes(ref = new Date()) {
  const fim = new Date(ref.getFullYear(), ref.getMonth()+1, 0)
  return isoLocal(fim)
}

export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Date local a partir de yyyy-mm-dd (new Date('2026-11-01') é UTC e volta um dia)
export function dataLocal(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function diaSemana(iso) {
  return DIAS_SEMANA[dataLocal(iso).getDay()]
}

// api.whatsapp.com é o link que o Chrome entrega ao app instalado no micro.
// Quem atende os funcionários pelo celular espelhado no WhatsApp Web precisa
// de web.whatsapp.com, então o destino é uma preferência deste navegador.
const CHAVE_DESTINO_WHATS = 'rh_whatsapp_destino'

export function ehMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
}

export function getDestinoWhats() {
  try {
    const salvo = localStorage.getItem(CHAVE_DESTINO_WHATS)
    if (salvo === 'web' || salvo === 'app') return salvo
  } catch (_) { /* navegação privada / storage bloqueado */ }
  // No celular o Web só redireciona para o app: lá o padrão é o app mesmo
  return ehMobile() ? 'app' : 'web'
}

export function setDestinoWhats(destino) {
  try { localStorage.setItem(CHAVE_DESTINO_WHATS, destino) } catch (_) { /* idem */ }
}

export function urlWhatsApp(telefone, mensagem, destino = getDestinoWhats()) {
  let phone = String(telefone || '').replace(/\D/g, '')
  if (!phone) return null
  if (!phone.startsWith('55')) phone = '55' + phone
  const base = destino === 'app'
    ? 'https://api.whatsapp.com/send'
    : 'https://web.whatsapp.com/send'
  return `${base}?phone=${phone}` +
    (mensagem ? `&text=${encodeURIComponent(mensagem)}` : '')
}

// Abre o WhatsApp com a mensagem pronta
export function abrirWhatsApp(telefone, mensagem) {
  const url = urlWhatsApp(telefone, mensagem)
  if (!url) return false
  window.open(url, '_blank')
  return true
}

// ════════════════════════════════════════════════════════════════
// FUNCIONÁRIOS
// ════════════════════════════════════════════════════════════════
export async function getFuncionarios(tenantId, { incluirInativos = true } = {}) {
  let q = supabase
    .from('funcionarios')
    .select('*')
    .eq('tenant_id', tid(tenantId))
    .order('nome', { ascending: true })

  if (!incluirInativos) q = q.eq('ativo', true)

  const { data, error } = await q
  if (tabelaFalta(error)) return { data: [], tabelaFalta: true }
  if (error) throw error
  return { data: data || [], tabelaFalta: false }
}

export async function salvarFuncionario(tenantId, func) {
  const { id, ...fields } = { ...func, tenant_id: tid(tenantId) }
  if (id) {
    const { error } = await supabase.from('funcionarios').update(fields).eq('id', id)
    if (error) throw error
    return id
  }
  const { data, error } = await supabase.from('funcionarios').insert([fields]).select('id').single()
  if (error) throw error
  return data?.id
}

export async function alternarAtivoFuncionario(id, ativo) {
  const { error } = await supabase.from('funcionarios').update({ ativo }).eq('id', id)
  if (error) throw error
}

export async function excluirFuncionario(id) {
  const { error } = await supabase.from('funcionarios').delete().eq('id', id)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════════
// VALES E PAGAMENTOS
// ════════════════════════════════════════════════════════════════
export const TIPOS_LANCAMENTO = [
  'VALE', 'ADIANTAMENTO', 'SALARIO', 'BONUS',
  'COMPRA_LOJA', 'DESCONTO', 'VALE_TRANSPORTE', 'REEMBOLSO',
]

export const LABEL_TIPO = {
  VALE:            'Vale',
  ADIANTAMENTO:    'Adiantamento',
  SALARIO:         'Salário',
  BONUS:           'Bônus',
  COMPRA_LOJA:     'Compra na loja',
  DESCONTO:        'Desconto',
  VALE_TRANSPORTE: 'Vale transporte',
  REEMBOLSO:       'Reembolso',
}

// Tipos que o funcionário deve à loja: abatem do que ele tem a receber
export const TIPOS_DESCONTO = ['DESCONTO', 'COMPRA_LOJA']

export function ehDesconto(tipo) {
  return TIPOS_DESCONTO.includes(tipo)
}

export function sinalTipo(tipo) {
  return ehDesconto(tipo) ? -1 : 1
}

// "Pago" não descreve um desconto: o que acontece com ele é ser descontado
export function labelStatus(lanc) {
  if (lanc.status !== 'PAGO') return ehDesconto(lanc.tipo) ? 'A descontar' : 'Pendente'
  return ehDesconto(lanc.tipo) ? 'Descontado' : 'Pago'
}

// ── Parcelamento ───────────────────────────────────────────────
export const FREQUENCIAS = [
  { v: 'mensal', l: 'Mensal' },
  { v: 'quin',   l: 'Quinzenal' },
  { v: 'sem',    l: 'Semanal' },
]

export const MAX_PARCELAS = 36

/**
 * Datas das parcelas a partir da primeira. No mensal, vencimento 29/30/31
 * cairia no mês seguinte quando o mês é curto, então prende no último dia.
 */
export function gerarDatasParcelas(dataBase, freq, parcelas) {
  const [ano, mes, dia] = String(dataBase).slice(0, 10).split('-').map(Number)
  return Array.from({ length: parcelas }, (_, i) => {
    if (freq === 'mensal') {
      const alvo   = new Date(ano, mes - 1 + i, 1)
      const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
      return isoLocal(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(dia, ultimo)))
    }
    const d = new Date(ano, mes - 1, dia)
    if (freq === 'quin')     d.setDate(d.getDate() + 15 * i)
    else if (freq === 'sem') d.setDate(d.getDate() + 7 * i)
    return isoLocal(d)
  })
}

function novoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Navegador antigo sem crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

/**
 * Grava uma compra/vale parcelado: uma linha por parcela, todas com o mesmo
 * grupo_id, cada uma com seu vencimento e seu status próprio.
 * O valor informado é o da parcela, não o total.
 */
export async function criarLancamentoParcelado(tenantId, base, { freq = 'mensal', parcelas = 1 } = {}) {
  const qtd = Math.min(MAX_PARCELAS, Math.max(1, parseInt(parcelas, 10) || 1))
  if (qtd === 1) return salvarLancamento(tenantId, base)

  const grupo = novoId()
  const datas = gerarDatasParcelas(base.data_prevista, freq, qtd)
  const linhas = datas.map((data, i) => ({
    ...base,
    descricao:      `${base.descricao || LABEL_TIPO[base.tipo] || ''} (${i + 1}/${qtd})`.trim(),
    data_prevista:  data,
    // Só a primeira parcela pode já nascer quitada
    status:         i === 0 ? base.status : 'PENDENTE',
    data_pagamento: i === 0 ? base.data_pagamento : null,
    grupo_id:       grupo,
    parcela:        i + 1,
    total_parcelas: qtd,
  }))
  await inserirLancamentosLote(tenantId, linhas)
  return grupo
}

export async function excluirGrupoLancamentos(grupoId) {
  const { error } = await supabase.from('rh_lancamentos').delete().eq('grupo_id', grupoId)
  if (error) throw error
}

export async function getLancamentos(tenantId, { dataInicio, dataFim, funcionarioId } = {}) {
  let q = supabase
    .from('rh_lancamentos')
    .select('*, funcionarios(id, nome, apelido, whatsapp)')
    .eq('tenant_id', tid(tenantId))
    .order('data_prevista', { ascending: false })

  if (dataInicio)     q = q.gte('data_prevista', dataInicio)
  if (dataFim)        q = q.lte('data_prevista', dataFim)
  if (funcionarioId)  q = q.eq('funcionario_id', funcionarioId)

  const { data, error } = await q
  if (tabelaFalta(error)) return { data: [], tabelaFalta: true }
  if (error) throw error
  return { data: data || [], tabelaFalta: false }
}

export async function salvarLancamento(tenantId, lanc) {
  const { id, funcionarios: _f, ...fields } = { ...lanc, tenant_id: tid(tenantId) }
  if (id) {
    const { error } = await supabase.from('rh_lancamentos').update(fields).eq('id', id)
    if (error) throw error
    return id
  }
  const { data, error } = await supabase.from('rh_lancamentos').insert([fields]).select('id').single()
  if (error) throw error
  return data?.id
}

export async function inserirLancamentosLote(tenantId, linhas) {
  const rows = linhas.map(({ id: _id, ...l }) => ({ ...l, tenant_id: tid(tenantId) }))
  const { error } = await supabase.from('rh_lancamentos').insert(rows)
  if (error) throw error
}

export async function pagarLancamento(id, dataPagamento, formaPagamento) {
  const fields = { status: 'PAGO', data_pagamento: dataPagamento }
  if (formaPagamento) fields.forma_pagamento = formaPagamento
  const { error } = await supabase.from('rh_lancamentos').update(fields).eq('id', id)
  if (error) throw error
}

export async function reabrirLancamento(id) {
  const { error } = await supabase.from('rh_lancamentos')
    .update({ status: 'PENDENTE', data_pagamento: null }).eq('id', id)
  if (error) throw error
}

export async function excluirLancamento(id) {
  const { error } = await supabase.from('rh_lancamentos').delete().eq('id', id)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════════
// COMPROVANTES DE PAGAMENTO (Supabase Storage)
// ════════════════════════════════════════════════════════════════
// O bucket é PRIVADO: recibo de banco e recibo assinado trazem nome, valor e
// assinatura do funcionário, então o registro guarda o caminho do arquivo e a
// tela exibe por URL assinada temporária — URL pública ficaria aberta a quem
// tivesse o link.
const BUCKET_COMPROVANTES = 'rh-comprovantes'
const MAX_COMPROVANTES     = 3
const MAX_TAMANHO          = 5 * 1024 * 1024
const VALIDADE_URL         = 60 * 60   // 1 hora
const TIPOS_COMPROVANTE    = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export const LIMITE_COMPROVANTES = MAX_COMPROVANTES

export function ehPdf(caminho) {
  return /\.pdf$/i.test(String(caminho || ''))
}

export async function uploadComprovante(file, lancamentoId, tenantId) {
  if (!TIPOS_COMPROVANTE.includes(file.type)) {
    throw new Error('Formato não suportado. Use JPG, PNG, WEBP ou PDF.')
  }
  if (file.size > MAX_TAMANHO) {
    throw new Error('Arquivo muito grande. Máximo 5MB.')
  }

  const extensao = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const caminho  = `${tid(tenantId)}/${lancamentoId}/${Date.now()}.${extensao}`

  const { data, error } = await supabase.storage
    .from(BUCKET_COMPROVANTES)
    .upload(caminho, file, { cacheControl: '3600', upsert: false })

  if (error) {
    // Bucket ainda não criado no Storage do Supabase
    if (error.message?.toLowerCase().includes('bucket')) {
      throw new Error('Bucket "rh-comprovantes" não existe no Storage do Supabase.')
    }
    throw new Error('Erro ao enviar o arquivo: ' + error.message)
  }

  return data.path
}

// Gera as URLs temporárias de exibição: { caminho: url }
export async function assinarComprovantes(caminhos) {
  if (!caminhos?.length) return {}
  const { data, error } = await supabase.storage
    .from(BUCKET_COMPROVANTES)
    .createSignedUrls(caminhos, VALIDADE_URL)
  if (error) throw new Error('Erro ao abrir os comprovantes: ' + error.message)
  const mapa = {}
  ;(data || []).forEach(item => {
    if (item.signedUrl) mapa[item.path] = item.signedUrl
  })
  return mapa
}

export async function excluirComprovante(caminho) {
  // Falha ao apagar o arquivo não deve travar a remoção do anexo na tela:
  // o caminho sai do registro de qualquer forma, então só registramos no console.
  const { error } = await supabase.storage.from(BUCKET_COMPROVANTES).remove([caminho])
  if (error) console.error('Erro ao apagar comprovante do storage', error)
}

export async function atualizarComprovantes(lancamentoId, comprovantes) {
  const { error } = await supabase.from('rh_lancamentos')
    .update({ comprovantes }).eq('id', lancamentoId)
  if (!error) return
  // Coluna ainda não criada: o aviso genérico do Postgres não diz o que fazer
  if (error.message?.includes('comprovantes')) {
    throw new Error('Rode a migration 20261101_rh_comprovantes.sql no Supabase.')
  }
  throw error
}

// ════════════════════════════════════════════════════════════════
// FALTAS, ATRASOS E OCORRÊNCIAS
// ════════════════════════════════════════════════════════════════
export const TIPOS_OCORRENCIA = ['FALTA', 'ATRASO', 'SAIDA_ANTECIPADA', 'ATESTADO', 'FOLGA']

export const LABEL_OCORRENCIA = {
  FALTA:            'Falta',
  ATRASO:           'Atraso',
  SAIDA_ANTECIPADA: 'Saída antecipada',
  ATESTADO:         'Atestado',
  FOLGA:            'Folga',
}

// Tipos que tiram o dia inteiro do funcionário — zeram o VT daquele dia
export const TIPOS_DIA_CHEIO = ['FALTA', 'ATESTADO', 'FOLGA']

export async function getOcorrencias(tenantId, { dataInicio, dataFim, funcionarioId, tipo } = {}) {
  let q = supabase
    .from('rh_ocorrencias')
    .select('*, funcionarios(id, nome, apelido, whatsapp)')
    .eq('tenant_id', tid(tenantId))
    .order('data', { ascending: false })

  if (dataInicio)    q = q.gte('data', dataInicio)
  if (dataFim)       q = q.lte('data', dataFim)
  if (funcionarioId) q = q.eq('funcionario_id', funcionarioId)
  if (tipo)          q = q.eq('tipo', tipo)

  const { data, error } = await q
  if (tabelaFalta(error)) return { data: [], tabelaFalta: true }
  if (error) throw error
  return { data: data || [], tabelaFalta: false }
}

export async function salvarOcorrencia(tenantId, oc) {
  const { id, funcionarios: _f, ...fields } = { ...oc, tenant_id: tid(tenantId) }
  if (id) {
    const { error } = await supabase.from('rh_ocorrencias').update(fields).eq('id', id)
    if (error) throw error
    return id
  }
  const { data, error } = await supabase.from('rh_ocorrencias').insert([fields]).select('id').single()
  if (error) throw error
  return data?.id
}

export async function excluirOcorrencia(id) {
  const { error } = await supabase.from('rh_ocorrencias').delete().eq('id', id)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════════
// FERIADOS
// ════════════════════════════════════════════════════════════════
export async function getFeriados(tenantId, { dataInicio, dataFim } = {}) {
  let q = supabase
    .from('rh_feriados')
    .select('*')
    .eq('tenant_id', tid(tenantId))
    .order('data', { ascending: true })

  if (dataInicio) q = q.gte('data', dataInicio)
  if (dataFim)    q = q.lte('data', dataFim)

  const { data, error } = await q
  if (tabelaFalta(error)) return { data: [], tabelaFalta: true }
  if (error) throw error
  return { data: data || [], tabelaFalta: false }
}

export async function salvarFeriado(tenantId, feriado) {
  const { id, ...fields } = { ...feriado, tenant_id: tid(tenantId) }
  if (id) {
    const { error } = await supabase.from('rh_feriados').update(fields).eq('id', id)
    if (error) throw error
    return id
  }
  const { data, error } = await supabase.from('rh_feriados').insert([fields]).select('id').single()
  if (error) throw error
  return data?.id
}

export async function excluirFeriado(id) {
  const { error } = await supabase.from('rh_feriados').delete().eq('id', id)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════════
// VALE TRANSPORTE
// ════════════════════════════════════════════════════════════════
export const LABEL_MOTIVO_VT = {
  FALTA:    'Falta',
  ATESTADO: 'Atestado',
  FERIADO:  'Feriado',
  FOLGA:    'Folga',
  NAO_USOU: 'Não utilizou',
}

// Dias da semana trabalhados do funcionário ("1,2,3,4,5" → Set {1,2,3,4,5})
export function diasTrabalhoSet(funcionario) {
  const txt = funcionario?.dias_trabalho ?? '1,2,3,4,5'
  const nums = String(txt).split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n))
  return new Set(nums.length ? nums : [1, 2, 3, 4, 5])
}

// Lista de yyyy-mm-dd de dataInicio até dataFim (inclusive)
export function listarDatas(dataInicio, dataFim) {
  const ini = dataLocal(dataInicio)
  const fim = dataLocal(dataFim)
  const out = []
  for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
    out.push(isoLocal(d))
    if (out.length > 400) break   // trava de segurança contra período absurdo
  }
  return out
}

/**
 * Monta os dias do período de VT já pré-marcados:
 * - dia fora da escala do funcionário → FOLGA (não conta como dia útil)
 * - feriado cadastrado               → FERIADO, sem ida nem volta
 * - falta / atestado / folga do ponto → zera o dia
 * - atraso / saída antecipada        → dia mantido (o usuário decide no grid)
 */
export function montarDiasVT({ funcionario, dataInicio, dataFim, feriados = [], ocorrencias = [] }) {
  const escala      = diasTrabalhoSet(funcionario)
  const mapFeriados = new Map(feriados.map(f => [String(f.data).slice(0, 10), f]))
  const mapOcor     = new Map()
  ocorrencias.forEach(o => {
    const dia = String(o.data).slice(0, 10)
    // Uma ocorrência que zera o dia tem prioridade sobre atraso no mesmo dia
    const atual = mapOcor.get(dia)
    if (!atual || (TIPOS_DIA_CHEIO.includes(o.tipo) && !TIPOS_DIA_CHEIO.includes(atual.tipo))) {
      mapOcor.set(dia, o)
    }
  })

  return listarDatas(dataInicio, dataFim).map(data => {
    const dow      = dataLocal(data).getDay()
    const naEscala = escala.has(dow)

    if (!naEscala) {
      return { data, ida: false, volta: false, motivo: 'FOLGA', dia_util: false }
    }

    const feriado = mapFeriados.get(data)
    if (feriado) {
      return {
        data, ida: false, volta: false, motivo: 'FERIADO', dia_util: true,
        detalhe: feriado.descricao || '',
      }
    }

    const oc = mapOcor.get(data)
    if (oc && oc.descontar !== false && TIPOS_DIA_CHEIO.includes(oc.tipo)) {
      return {
        data, ida: false, volta: false,
        motivo: oc.tipo === 'FOLGA' ? 'FOLGA' : oc.tipo,
        dia_util: oc.tipo !== 'FOLGA',
        detalhe: oc.observacao || '',
      }
    }

    return { data, ida: true, volta: true, motivo: '', dia_util: true }
  })
}

/**
 * Totais do período. Dia fora da escala (FOLGA) não entra no bruto nem no
 * líquido; feriado e falta entram no bruto e viram desconto.
 */
export function calcularTotaisVT(dias, valorIda, valorVolta) {
  const vIda   = Number(valorIda)   || 0
  const vVolta = Number(valorVolta) || 0
  const uteis  = dias.filter(d => d.dia_util !== false)

  const totalBruto = uteis.length * (vIda + vVolta)
  const totalLiquido = uteis.reduce((s, d) =>
    s + (d.ida ? vIda : 0) + (d.volta ? vVolta : 0), 0)

  const descontos = uteis
    .filter(d => !d.ida || !d.volta)
    .map(d => ({
      data:   d.data,
      motivo: d.motivo || 'NAO_USOU',
      ida:    !d.ida,
      volta:  !d.volta,
      valor:  (d.ida ? 0 : vIda) + (d.volta ? 0 : vVolta),
    }))

  return {
    diasUteis:      uteis.length,
    diasPagos:      uteis.filter(d => d.ida || d.volta).length,
    totalBruto,
    totalLiquido,
    totalDescontos: totalBruto - totalLiquido,
    descontos,
  }
}

export function textoDesconto(desc) {
  const trecho = desc.ida && desc.volta ? 'ida e volta' : desc.ida ? 'ida' : 'volta'
  const motivo = LABEL_MOTIVO_VT[desc.motivo] || 'Desconto'
  return `${fmtData(desc.data)} — ${motivo} (${trecho}) -${fmtR(desc.valor)}`
}

/** Mensagem de WhatsApp com os valores, dias e descontos do período */
export function mensagemVT({ funcionario, dataInicio, dataFim, valorIda, valorVolta, totais }) {
  const primeiroNome = String(funcionario?.apelido || funcionario?.nome || '').split(' ')[0]
  const linhas = [
    `Olá, ${primeiroNome}! Tudo bem?`,
    '',
    `*Vale transporte — ${fmtData(dataInicio)} a ${fmtData(dataFim)}*`,
    '',
    `Ida: ${fmtR(valorIda)}  |  Volta: ${fmtR(valorVolta)}`,
    `Dias de trabalho no período: ${totais.diasUteis}`,
    `Valor cheio do período: ${fmtR(totais.totalBruto)}`,
  ]

  if (totais.descontos.length) {
    linhas.push('', `*Descontos: -${fmtR(totais.totalDescontos)}*`)
    totais.descontos.forEach(d => linhas.push(`• ${textoDesconto(d)}`))
  } else {
    linhas.push('', 'Nenhum desconto no período.')
  }

  linhas.push('', `*Total a receber: ${fmtR(totais.totalLiquido)}*`, '', 'Qualquer dúvida, me avise!')
  return linhas.join('\n')
}

export async function getPeriodosVT(tenantId, { dataInicio, dataFim, funcionarioId } = {}) {
  let q = supabase
    .from('rh_vt_periodos')
    .select('*, funcionarios(id, nome, apelido, whatsapp)')
    .eq('tenant_id', tid(tenantId))
    .order('data_inicio', { ascending: false })

  // Pega todo período que encosta na janela filtrada
  if (dataFim)       q = q.lte('data_inicio', dataFim)
  if (dataInicio)    q = q.gte('data_fim', dataInicio)
  if (funcionarioId) q = q.eq('funcionario_id', funcionarioId)

  const { data, error } = await q
  if (tabelaFalta(error)) return { data: [], tabelaFalta: true }
  if (error) throw error
  return { data: data || [], tabelaFalta: false }
}

export async function getDiasVT(periodoId) {
  const { data, error } = await supabase
    .from('rh_vt_dias')
    .select('*')
    .eq('periodo_id', periodoId)
    .order('data', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Grava o período e seus dias. Em edição, apaga os dias antigos e regrava —
 * o período é sempre salvo por inteiro, então não há estado parcial a manter.
 */
export async function salvarPeriodoVT(tenantId, periodo, dias) {
  const tenant = tid(tenantId)
  const { id, funcionarios: _f, ...fields } = { ...periodo, tenant_id: tenant }

  let periodoId = id
  if (periodoId) {
    const { error } = await supabase.from('rh_vt_periodos').update(fields).eq('id', periodoId)
    if (error) throw error
    const { error: errDel } = await supabase.from('rh_vt_dias').delete().eq('periodo_id', periodoId)
    if (errDel) throw errDel
  } else {
    const { data, error } = await supabase.from('rh_vt_periodos')
      .insert([fields]).select('id').single()
    if (error) throw error
    periodoId = data.id
  }

  const rows = dias.map(d => ({
    tenant_id:  tenant,
    periodo_id: periodoId,
    data:       d.data,
    ida:        !!d.ida,
    volta:      !!d.volta,
    // dia_util é derivado da escala; guardamos como FOLGA para reconstruir o grid
    motivo:     d.dia_util === false ? 'FOLGA' : (d.motivo || null),
  }))

  if (rows.length) {
    const { error } = await supabase.from('rh_vt_dias').insert(rows)
    if (error) throw error
  }

  return periodoId
}

export async function pagarPeriodoVT(id, dataPagamento) {
  const { error } = await supabase.from('rh_vt_periodos')
    .update({ status: 'PAGO', data_pagamento: dataPagamento }).eq('id', id)
  if (error) throw error
}

export async function reabrirPeriodoVT(id) {
  const { error } = await supabase.from('rh_vt_periodos')
    .update({ status: 'PENDENTE', data_pagamento: null }).eq('id', id)
  if (error) throw error
}

export async function excluirPeriodoVT(id) {
  // rh_vt_dias tem ON DELETE CASCADE
  const { error } = await supabase.from('rh_vt_periodos').delete().eq('id', id)
  if (error) throw error
}

// Lança o VT do período em Vales e Pagamentos, para entrar no total do funcionário
export async function lancarVTComoPagamento(tenantId, periodo, funcionarioNome) {
  return salvarLancamento(tenantId, {
    funcionario_id: periodo.funcionario_id,
    tipo:           'VALE_TRANSPORTE',
    descricao:      `VT ${fmtData(periodo.data_inicio)} a ${fmtData(periodo.data_fim)}` +
                    (funcionarioNome ? ` — ${funcionarioNome}` : ''),
    valor:          Number(periodo.total_liquido) || 0,
    data_prevista:  periodo.data_fim,
    status:         periodo.status === 'PAGO' ? 'PAGO' : 'PENDENTE',
    data_pagamento: periodo.status === 'PAGO' ? (periodo.data_pagamento || periodo.data_fim) : null,
    vt_periodo_id:  periodo.id || null,
  })
}

/**
 * Resumo por funcionário. Receber e descontar ficam separados: somados com
 * sinal, uma compra parcelada deixava o "a pagar" negativo e ilegível.
 * `saldo` é o que sobra para o funcionário depois dos descontos pendentes.
 */
export function resumoPorFuncionario(lancamentos) {
  const mapa = new Map()
  lancamentos.forEach(l => {
    const f = l.funcionarios || {}
    const key = l.funcionario_id
    if (!mapa.has(key)) {
      mapa.set(key, {
        funcionario_id: key,
        nome:       f.apelido || f.nome || 'Sem nome',
        whatsapp:   f.whatsapp || '',
        aReceber:   0,
        aDescontar: 0,
        pago:       0,
        descontado: 0,
      })
    }
    const item  = mapa.get(key)
    const valor = Number(l.valor) || 0
    if (ehDesconto(l.tipo)) {
      if (l.status === 'PAGO') item.descontado += valor
      else                     item.aDescontar += valor
    } else {
      if (l.status === 'PAGO') item.pago     += valor
      else                     item.aReceber += valor
    }
  })
  return [...mapa.values()]
    .map(r => ({ ...r, saldo: r.aReceber - r.aDescontar }))
    .sort((a, b) => a.nome.localeCompare(b.nome))
}
