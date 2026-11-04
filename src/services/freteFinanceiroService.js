import { supabase } from '../lib/supabase'

// ============================================================================
// FINANCEIRO DO FRETE — romaneio x Mercado Pago x transferência
// ============================================================================
// Responde três perguntas que antes não tinham resposta:
//
//   1. quanto custou o frete de cada romaneio (valor_frete da cotação)
//   2. quanto entrou no Mercado Pago por aquele romaneio (PIX do frete +
//      recebimento manual), já descontada a taxa do MP
//   3. esse dinheiro já foi transferido para a conta que gera crédito no
//      Melhor Envio?
//
// E separa, no extrato do MP, o que é frete do que é venda.
// ============================================================================

const FUSO = '-03:00'

// Supabase compara timestamptz: sem fuso explícito a data vira meia-noite UTC
// e o filtro pega o dia errado (o Brasil está 3h atrás).
function inicioDoDia(iso) { return `${iso}T00:00:00.000${FUSO}` }
function fimDoDia(iso)    { return `${iso}T23:59:59.999${FUSO}` }

const METODOS_MP = ['pix', 'cartao', 'boleto']

function num(v) {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

// ── Romaneios com o financeiro calculado ────────────────────────────────────

const CAMPOS_ROMANEIO = `
  id, numero, cliente_instagram, status, valor_frete, created_at, frete_pago_em,
  transportadora, servico, codigo_rastreio,
  frete_transferido, frete_transferido_em, frete_transferido_por_nome,
  frete_recebido_manual, frete_recebido_obs,
  pagamentos_frete (
    id, valor, valor_original, valor_liquido, mp_taxa, status, metodo,
    pago_em, gateway_transaction_id, observacao
  )
`

/**
 * Romaneios do período com custo do frete, recebido no MP e diferença.
 * @param {string} tenantId
 * @param {{ dataIni: string, dataFim: string }} filtros - datas yyyy-mm-dd
 */
export async function getRomaneiosFinanceiro(tenantId, { dataIni, dataFim }) {
  const { data, error } = await supabase
    .from('romaneios')
    .select(CAMPOS_ROMANEIO)
    .eq('tenant_id', tenantId)
    .gte('created_at', inicioDoDia(dataIni))
    .lte('created_at', fimDoDia(dataFim))
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(calcularLinha)
}

/**
 * Soma o que entrou por um romaneio e calcula a diferença contra o frete.
 * Só pagamento aprovado conta. Baixa manual (crédito, cortesia) não é dinheiro
 * no Mercado Pago: aparece marcada, mas não entra no valor recebido.
 */
export function calcularLinha(r) {
  const pagos = (r.pagamentos_frete || []).filter(p => p.status === 'aprovado')

  const noMp = pagos.filter(p => METODOS_MP.includes(p.metodo))
  const semMp = pagos.filter(p => !METODOS_MP.includes(p.metodo))

  const recebidoBruto = noMp.reduce((s, p) => s + num(p.valor), 0)
  const taxaMp        = noMp.reduce((s, p) => s + num(p.mp_taxa), 0)

  // Quando a taxa ainda não foi sincronizada, o líquido cai para o bruto
  const liquidoMp = noMp.reduce(
    (s, p) => s + (p.valor_liquido === null || p.valor_liquido === undefined ? num(p.valor) : num(p.valor_liquido)),
    0
  )

  const manual   = num(r.frete_recebido_manual)
  const recebido = Number((liquidoMp + manual).toFixed(2))
  const frete    = num(r.valor_frete)

  return {
    ...r,
    pagamentosPagos: pagos,
    recebidoBruto: Number(recebidoBruto.toFixed(2)),
    taxaMp:        Number(taxaMp.toFixed(2)),
    liquidoMp:     Number(liquidoMp.toFixed(2)),
    recebidoManual: manual,
    recebido,
    frete,
    // Positivo = falta dinheiro para cobrir a postagem. Negativo = sobrou.
    diferenca: Number((frete - recebido).toFixed(2)),
    semDinheiroNoMp: noMp.length === 0 && semMp.length > 0,
    metodosBaixa: semMp.map(p => p.metodo),
    pagoNoMp: noMp.length > 0,
  }
}

/**
 * Marca (ou desmarca) que o dinheiro do frete já foi transferido.
 * @param {string[]} ids - ids dos romaneios
 * @param {boolean} transferido
 * @param {{ id?: string, nome?: string }} usuario
 */
export async function marcarTransferido(ids, transferido, usuario = {}) {
  if (!ids?.length) return

  const campos = transferido
    ? {
        frete_transferido: true,
        frete_transferido_em: new Date().toISOString(),
        frete_transferido_por: usuario.id || null,
        frete_transferido_por_nome: usuario.nome || null,
      }
    : {
        frete_transferido: false,
        frete_transferido_em: null,
        frete_transferido_por: null,
        frete_transferido_por_nome: null,
      }

  const { error } = await supabase.from('romaneios').update(campos).in('id', ids)
  if (error) throw error
}

/**
 * Registra frete recebido fora do PIX do sistema (dinheiro, junto com a venda).
 * @param {string} romaneioId
 * @param {number|string|null} valor
 * @param {string} obs
 */
export async function salvarRecebidoManual(romaneioId, valor, obs = '') {
  const v = valor === '' || valor === null || valor === undefined ? null : num(valor)

  const { error } = await supabase
    .from('romaneios')
    .update({ frete_recebido_manual: v, frete_recebido_obs: obs || null })
    .eq('id', romaneioId)

  if (error) throw error
}

// ── Extrato do Mercado Pago ─────────────────────────────────────────────────

/**
 * Extrato já espelhado no banco (não chama o Mercado Pago).
 * @param {string} tenantId
 * @param {{ dataIni: string, dataFim: string }} filtros
 */
export async function getExtratoMP(tenantId, { dataIni, dataFim }) {
  const { data, error } = await supabase
    .from('mp_extrato')
    .select(`
      id, mp_payment_id, data_aprovacao, valor, taxa, liquido, metodo,
      descricao, payer_email, status, origem, origem_auto, romaneio_id,
      romaneios ( numero, cliente_instagram )
    `)
    .eq('tenant_id', tenantId)
    .gte('data_aprovacao', inicioDoDia(dataIni))
    .lte('data_aprovacao', fimDoDia(dataFim))
    .order('data_aprovacao', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Baixa os pagamentos aprovados do período no Mercado Pago e classifica cada
 * um em frete / venda / outro. O token do MP fica no servidor.
 * @param {string} tenantId
 * @param {{ dataIni: string, dataFim: string }} filtros
 */
export async function sincronizarExtratoMP(tenantId, { dataIni, dataFim }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.')

  const resp = await fetch('/api/mp-extrato', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ tenantId, dataIni, dataFim }),
  })

  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(json.error || 'Erro ao sincronizar o extrato')
  return json
}

/**
 * Troca a classificação de uma linha do extrato. Classificação feita à mão não
 * é sobrescrita pela próxima sincronização.
 * @param {string} id
 * @param {'frete'|'venda'|'outro'} origem
 */
export async function classificarExtrato(id, origem) {
  const { error } = await supabase
    .from('mp_extrato')
    .update({ origem, origem_auto: false })
    .eq('id', id)

  if (error) throw error
}

// ── Totais ──────────────────────────────────────────────────────────────────

/** Resumo dos romaneios filtrados, já pronto para os cartões do topo. */
export function totaisRomaneios(linhas) {
  const t = {
    qtd: linhas.length,
    frete: 0,
    recebido: 0,
    taxa: 0,
    falta: 0,
    sobra: 0,
    aTransferir: 0,
    transferido: 0,
  }

  for (const l of linhas) {
    t.frete    += l.frete
    t.recebido += l.recebido
    t.taxa     += l.taxaMp
    if (l.diferenca > 0) t.falta += l.diferenca
    else t.sobra += -l.diferenca
    if (l.frete_transferido) t.transferido += l.recebido
    else t.aTransferir += l.recebido
  }

  for (const k of Object.keys(t)) {
    if (k !== 'qtd') t[k] = Number(t[k].toFixed(2))
  }
  return t
}

/** Resumo do extrato do MP por origem. */
export function totaisExtrato(linhas) {
  const base = () => ({ qtd: 0, bruto: 0, taxa: 0, liquido: 0 })
  const t = { frete: base(), venda: base(), outro: base(), geral: base() }

  for (const l of linhas) {
    const alvo = t[l.origem] || t.outro
    for (const g of [alvo, t.geral]) {
      g.qtd += 1
      g.bruto   += num(l.valor)
      g.taxa    += num(l.taxa)
      g.liquido += num(l.liquido)
    }
  }

  for (const g of Object.values(t)) {
    g.bruto   = Number(g.bruto.toFixed(2))
    g.taxa    = Number(g.taxa.toFixed(2))
    g.liquido = Number(g.liquido.toFixed(2))
  }
  return t
}
