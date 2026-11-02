import { supabase } from '../lib/supabase'
import { isoLocal, dataLocal, diasTrabalhoSet, competenciaDe } from './rhService'

const tid = (tenantId) => tenantId || import.meta.env.VITE_TENANT_ID

const BUCKET_PONTO  = 'rh-ponto'
const MESES_GUARDAR = 6          // selfies; a marcação nunca é apagada

export const TIPOS_BATIDA = ['ENTRADA', 'SAIDA_ALMOCO', 'VOLTA_ALMOCO', 'SAIDA']

export const LABEL_BATIDA = {
  ENTRADA:      'Entrada',
  SAIDA_ALMOCO: 'Saída almoço',
  VOLTA_ALMOCO: 'Volta almoço',
  SAIDA:        'Saída',
}

export function tabelaFaltaPonto(error) {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST202' || error.code === 'PGRST205' ||
    error.message?.includes('does not exist') || error.message?.includes('schema cache')
}

// ── Helpers de hora ────────────────────────────────────────────
export function horaDe(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 7.5 → "7h30". Negativo sai com o sinal: "-1h15" */
export function fmtHoras(horas) {
  const n = Number(horas) || 0
  const sinal = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  const h = Math.floor(abs)
  const m = Math.round((abs - h) * 60)
  if (m === 60) return `${sinal}${h + 1}h00`
  return `${sinal}${h}h${String(m).padStart(2, '0')}`
}

function horasEntre(a, b) {
  if (!a || !b) return 0
  return (new Date(b) - new Date(a)) / 3600000
}

/** '08:00:00' → 480. Devolve null quando não há horário. */
export function minutosDeHora(h) {
  if (!h) return null
  const [hh, mm] = String(h).split(':').map(Number)
  if (!Number.isFinite(hh)) return null
  return hh * 60 + (Number.isFinite(mm) ? mm : 0)
}

const hhmm = (h) => String(h || '').slice(0, 5)

/**
 * Jornada contratual do funcionário. As horas por dia saem dos horários
 * quando eles existem; carga_horaria_diaria fica como reserva para quem
 * ainda não tem jornada cadastrada.
 */
export function jornadaDe(func = {}) {
  const entrada     = minutosDeHora(func.hora_entrada)
  const saidaAlmoco = minutosDeHora(func.hora_saida_almoco)
  const voltaAlmoco = minutosDeHora(func.hora_volta_almoco)
  const saida       = minutosDeHora(func.hora_saida)

  let horas = Number(func.carga_horaria_diaria) || 8
  let texto = null

  if (entrada != null && saida != null) {
    const almoco = (saidaAlmoco != null && voltaAlmoco != null)
      ? Math.max(0, voltaAlmoco - saidaAlmoco)
      : 0
    horas = Number(((saida - entrada - almoco) / 60).toFixed(2))
    texto = almoco
      ? `${hhmm(func.hora_entrada)}–${hhmm(func.hora_saida_almoco)} / ${hhmm(func.hora_volta_almoco)}–${hhmm(func.hora_saida)}`
      : `${hhmm(func.hora_entrada)}–${hhmm(func.hora_saida)}`
  }

  return {
    entrada, saidaAlmoco, voltaAlmoco, saida,
    horas,
    tolerancia: Number.isFinite(Number(func.tolerancia_minutos)) ? Number(func.tolerancia_minutos) : 10,
    texto,
  }
}

// ── Quiosque ───────────────────────────────────────────────────
export async function getFuncionariosPonto() {
  const { data, error } = await supabase.rpc('rh_funcionarios_ponto')
  if (tabelaFaltaPonto(error)) return { data: [], semEstrutura: true }
  if (error) throw error
  return { data: data || [], semEstrutura: false }
}

/** Envia a selfie e devolve o caminho no bucket (null se não houver foto) */
export async function enviarFotoPonto(blob, tenantId, funcionarioId) {
  if (!blob) return null
  const caminho = `${tid(tenantId)}/fotos/${funcionarioId}/${Date.now()}.jpg`
  const { data, error } = await supabase.storage
    .from(BUCKET_PONTO)
    .upload(caminho, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
  if (error) {
    // Foto é prova de apoio: se o upload falhar, a batida não pode ser perdida
    console.error('Falha ao enviar a selfie do ponto', error)
    return null
  }
  return data.path
}

/**
 * Grava a batida. Quem confere o PIN e carimba a hora é o banco:
 * o relógio do aparelho não entra na conta.
 */
export async function registrarPonto({ funcionarioId, pin, tipo, fotoPath, origem = 'QUIOSQUE' }) {
  const { data, error } = await supabase.rpc('rh_registrar_ponto', {
    p_funcionario: funcionarioId,
    p_pin:         pin,
    p_tipo:        tipo,
    p_foto:        fotoPath || null,
    p_origem:      origem,
  })
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

export async function definirPinPonto(funcionarioId, pin) {
  const { error } = await supabase.rpc('rh_definir_pin', {
    p_funcionario: funcionarioId,
    p_pin:         pin,
  })
  if (error) throw error
}

// ── Consulta ───────────────────────────────────────────────────
export async function getMarcacoes(tenantId, { dataInicio, dataFim, funcionarioId } = {}) {
  let q = supabase
    .from('rh_ponto_marcacoes')
    .select('*, funcionarios(id, nome, apelido)')
    .eq('tenant_id', tid(tenantId))
    .order('registrado_em', { ascending: true })

  if (dataInicio)    q = q.gte('dia', dataInicio)
  if (dataFim)       q = q.lte('dia', dataFim)
  if (funcionarioId) q = q.eq('funcionario_id', funcionarioId)

  const { data, error } = await q
  if (tabelaFaltaPonto(error)) return { data: [], semEstrutura: true }
  if (error) throw error
  return { data: data || [], semEstrutura: false }
}

export async function getAjustes(tenantId, { dataInicio, dataFim, funcionarioId } = {}) {
  let q = supabase
    .from('rh_ponto_ajustes')
    .select('*')
    .eq('tenant_id', tid(tenantId))
    .order('created_at', { ascending: true })

  if (dataInicio)    q = q.gte('dia', dataInicio)
  if (dataFim)       q = q.lte('dia', dataFim)
  if (funcionarioId) q = q.eq('funcionario_id', funcionarioId)

  const { data, error } = await q
  if (tabelaFaltaPonto(error)) return { data: [], semEstrutura: true }
  if (error) throw error
  return { data: data || [], semEstrutura: false }
}

/** Correção nunca sobrescreve: entra como ajuste, com motivo e autor. */
export async function registrarAjuste(tenantId, ajuste) {
  const { error } = await supabase.from('rh_ponto_ajustes').insert([{
    ...ajuste,
    tenant_id: tid(tenantId),
  }])
  if (error) throw error
}

export async function assinarUrlsPonto(caminhos) {
  if (!caminhos?.length) return {}
  const { data, error } = await supabase.storage
    .from(BUCKET_PONTO).createSignedUrls(caminhos, 3600)
  if (error) throw error
  const mapa = {}
  ;(data || []).forEach(i => { if (i.signedUrl) mapa[i.path] = i.signedUrl })
  return mapa
}

// ── Espelho do mês ─────────────────────────────────────────────
/**
 * Monta o dia a dia do funcionário no período: as 4 batidas (já com os
 * ajustes aplicados por cima), horas trabalhadas, intervalo e saldo.
 * O ajuste mais recente de cada dia+tipo é o que vale.
 */
export function montarEspelho({
  funcionario, dataInicio, dataFim, marcacoes = [], ajustes = [], feriados = [],
  hoje = isoLocal(new Date()),
}) {
  const escala    = diasTrabalhoSet(funcionario)
  const jornada   = jornadaDe(funcionario)
  const carga     = jornada.horas
  const setFeriado = new Set(feriados.map(f => String(f.data).slice(0, 10)))

  const porDia = new Map()
  const garante = (dia) => {
    if (!porDia.has(dia)) {
      porDia.set(dia, { dia, batidas: {}, ajustadas: {}, extras: [] })
    }
    return porDia.get(dia)
  }

  marcacoes.forEach(m => {
    const dia = String(m.dia).slice(0, 10)
    const reg = garante(dia)
    // Duas batidas do mesmo tipo no dia: a primeira é a válida, a outra
    // vira observação em vez de sumir do espelho
    if (reg.batidas[m.tipo]) reg.extras.push(m)
    else reg.batidas[m.tipo] = m
  })

  ajustes.forEach(a => {
    const dia = String(a.dia).slice(0, 10)
    const reg = garante(dia)
    reg.ajustadas[a.tipo] = a      // ordenados por created_at: o último vence
  })

  const dias = []
  const ini = dataLocal(dataInicio)
  const fim = dataLocal(dataFim)
  for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
    const dia = isoLocal(d)
    const reg = porDia.get(dia) || { dia, batidas: {}, ajustadas: {}, extras: [] }
    const diaUtil = escala.has(dataLocal(dia).getDay()) && !setFeriado.has(dia)

    const horarios = {}
    TIPOS_BATIDA.forEach(tipo => {
      const ajuste = reg.ajustadas[tipo]
      horarios[tipo] = ajuste ? ajuste.valor_novo : (reg.batidas[tipo]?.registrado_em || null)
    })

    const manha = horasEntre(horarios.ENTRADA, horarios.SAIDA_ALMOCO)
    const tarde = horasEntre(horarios.VOLTA_ALMOCO, horarios.SAIDA)
    // Sem batida de almoço, conta entrada → saída direto
    const direto = (!horarios.SAIDA_ALMOCO && !horarios.VOLTA_ALMOCO)
      ? horasEntre(horarios.ENTRADA, horarios.SAIDA)
      : 0
    const trabalhadas = Number((manha + tarde + direto).toFixed(2))
    const intervalo   = Number(horasEntre(horarios.SAIDA_ALMOCO, horarios.VOLTA_ALMOCO).toFixed(2))

    const semBatida = TIPOS_BATIDA.every(t => !horarios[t])
    // Dia que ainda não chegou não deve horas nem é falta: sem isto o mês
    // inteiro nasce no vermelho já no dia 1º.
    const futuro    = dia > hoje
    const previstas = diaUtil && !futuro ? carga : 0

    // Atraso na entrada, respeitando a tolerância do cadastro
    let atrasoMin = 0
    if (diaUtil && horarios.ENTRADA && jornada.entrada != null) {
      const bateu = new Date(horarios.ENTRADA)
      const diff  = (bateu.getHours() * 60 + bateu.getMinutes()) - jornada.entrada
      if (diff > jornada.tolerancia) atrasoMin = diff
    }

    dias.push({
      dia,
      diaUtil,
      futuro,
      feriado:     setFeriado.has(dia),
      horarios,
      ajustadas:   reg.ajustadas,
      marcacoes:   reg.batidas,
      extras:      reg.extras,
      trabalhadas,
      intervalo,
      previstas,
      atrasoMin,
      saldo:       Number((trabalhadas - previstas).toFixed(2)),
      falta:       diaUtil && semBatida && !futuro,
      incompleto:  !semBatida && TIPOS_BATIDA.some(t => !horarios[t]),
    })
  }

  const totais = dias.reduce((acc, d) => ({
    previstas:   acc.previstas   + d.previstas,
    trabalhadas: acc.trabalhadas + d.trabalhadas,
    faltas:      acc.faltas      + (d.falta ? 1 : 0),
    atrasos:     acc.atrasos     + (d.atrasoMin ? 1 : 0),
    atrasoMin:   acc.atrasoMin   + d.atrasoMin,
  }), { previstas: 0, trabalhadas: 0, faltas: 0, atrasos: 0, atrasoMin: 0 })

  return {
    dias,
    jornada,
    totais: {
      ...totais,
      previstas:   Number(totais.previstas.toFixed(2)),
      trabalhadas: Number(totais.trabalhadas.toFixed(2)),
      saldo:       Number((totais.trabalhadas - totais.previstas).toFixed(2)),
    },
  }
}

// ── Fechamento ─────────────────────────────────────────────────
export async function getFechamentos(tenantId, { competencia, funcionarioId } = {}) {
  let q = supabase
    .from('rh_ponto_fechamentos')
    .select('*, funcionarios(id, nome, apelido, whatsapp)')
    .eq('tenant_id', tid(tenantId))
    .order('competencia', { ascending: false })

  if (competencia)   q = q.eq('competencia', competencia)
  if (funcionarioId) q = q.eq('funcionario_id', funcionarioId)

  const { data, error } = await q
  if (tabelaFaltaPonto(error)) return { data: [], semEstrutura: true }
  if (error) throw error
  return { data: data || [], semEstrutura: false }
}

export async function salvarFechamento(tenantId, fechamento) {
  const { data, error } = await supabase
    .from('rh_ponto_fechamentos')
    .upsert({ ...fechamento, tenant_id: tid(tenantId) }, { onConflict: 'funcionario_id,competencia' })
    .select('id')
    .single()
  if (error) throw error
  return data?.id
}

/** SHA-256 do PDF enviado: prova que o assinado é o mesmo documento */
export async function hashArquivo(arrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function enviarEspelhoAssinado(file, tenantId, funcionarioId, competencia) {
  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const caminho = `${tid(tenantId)}/assinados/${funcionarioId}/${competencia}-${Date.now()}.${ext}`
  const { data, error } = await supabase.storage
    .from(BUCKET_PONTO)
    .upload(caminho, file, { cacheControl: '3600', upsert: false })
  if (error) throw new Error('Erro ao enviar o espelho assinado: ' + error.message)
  return data.path
}

// ── Expurgo das selfies ────────────────────────────────────────
const CHAVE_EXPURGO = 'rh_ponto_ultimo_expurgo'

/** Roda no máximo uma vez por dia, ao abrir a aba Ponto. */
export async function expurgarFotosAntigas() {
  try {
    const hoje = isoLocal(new Date())
    if (localStorage.getItem(CHAVE_EXPURGO) === hoje) return 0
    localStorage.setItem(CHAVE_EXPURGO, hoje)
  } catch (_) { /* storage bloqueado: segue e tenta expurgar */ }

  const { data, error } = await supabase.rpc('rh_ponto_expirar_fotos', { p_meses: MESES_GUARDAR })
  if (error || !data?.length) return 0

  const caminhos = data.map(r => r.caminho).filter(Boolean)
  if (caminhos.length) {
    const { error: errStorage } = await supabase.storage.from(BUCKET_PONTO).remove(caminhos)
    if (errStorage) console.error('Falha ao apagar selfies expiradas', errStorage)
  }
  return caminhos.length
}

export { competenciaDe }
