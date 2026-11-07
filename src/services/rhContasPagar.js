import { supabase } from '../lib/supabase'

/**
 * Espelho dos lançamentos do RH no Contas a Pagar.
 *
 * Vale, salário, comissão e vale transporte são dinheiro saindo da empresa,
 * mas viviam só no RH — o financeiro não enxergava nada disso. Cada
 * lançamento passa a manter uma linha lá, amarrada por (origem, origem_id).
 *
 * Desconto e compra na loja ficam de fora de propósito: são abatimentos do
 * que a funcionária tem a receber, não despesa a pagar.
 */

const CATEGORIA = 'Funcionario'

// Formatador próprio: importar de rhService fecharia um ciclo, já que é
// ele quem chama este arquivo.
const fmtData = (iso) => {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-')
  return d ? `${d}/${m}/${a}` : ''
}

// Tipos de lançamento que viram conta a pagar
const TIPOS_DESPESA_RH = new Set([
  'VALE', 'ADIANTAMENTO', 'SALARIO', 'COMISSAO', 'BONUS', 'REEMBOLSO', 'VALE_TRANSPORTE',
])

const LABEL = {
  VALE:            'Vale',
  ADIANTAMENTO:    'Adiantamento',
  SALARIO:         'Salário',
  COMISSAO:        'Comissão',
  BONUS:           'Bônus',
  REEMBOLSO:       'Reembolso',
  VALE_TRANSPORTE: 'Vale transporte',
}

export function geraContaPagar(tipo) {
  return TIPOS_DESPESA_RH.has(tipo)
}

/** Erro de coluna ausente: a migração da origem ainda não rodou */
function semColunaOrigem(error) {
  const msg = String(error?.message || '')
  return error?.code === '42703' || msg.includes('origem')
}

/**
 * Cria ou atualiza a conta daquela origem. O índice único em
 * (tenant_id, origem, origem_id) é quem garante uma conta por lançamento,
 * mesmo com duas abas salvando ao mesmo tempo.
 */
async function gravar(tenantId, { origem, origemId, descricao, valor, vencimento, pago, dataPagamento }) {
  if (!tenantId || !origemId) return
  const linha = {
    tenant_id:       tenantId,
    origem,
    origem_id:       origemId,
    observacao:      descricao,
    categoria:       CATEGORIA,
    tipo_despesa:    'Fixa',
    valor:           Number(valor) || 0,
    data_vencimento: vencimento,
    status:          pago ? 'PAGO' : 'A PAGAR',
    data_pagamento:  pago ? (dataPagamento || vencimento) : null,
  }
  const { error } = await supabase
    .from('contas_pagar')
    .upsert(linha, { onConflict: 'tenant_id,origem,origem_id' })
  // A conta a pagar é um espelho: se falhar, o lançamento do RH não pode
  // ser perdido junto. O erro vai para o console e a vida segue.
  if (error && !semColunaOrigem(error)) console.error('Conta a pagar do RH', error)
}

async function remover(origem, origemId) {
  if (!origemId) return
  const { error } = await supabase.from('contas_pagar')
    .delete().eq('origem', origem).eq('origem_id', origemId)
  if (error && !semColunaOrigem(error)) console.error('Conta a pagar do RH', error)
}

// ── Lançamentos de Vales e Pagamentos ──────────────────────────
// O VT lançado em Vales e Pagamentos reaproveita a chave do período,
// senão a mesma despesa apareceria duas vezes no financeiro.
const chaveDoLancamento = (l) => l?.vt_periodo_id
  ? { origem: 'RH_VT',   origemId: l.vt_periodo_id }
  : { origem: 'RH_LANC', origemId: l.id }

function descricaoDoLancamento(lanc, nome) {
  const partes = [LABEL[lanc.tipo] || lanc.tipo]
  if (nome) partes.push(nome)
  if (lanc.descricao && lanc.descricao !== LABEL[lanc.tipo]) partes.push(lanc.descricao)
  return partes.join(' — ')
}

export async function sincronizarContaLancamento(tenantId, lanc, nome) {
  if (!lanc?.id) return
  const chave = chaveDoLancamento(lanc)

  if (!geraContaPagar(lanc.tipo)) {
    // Mudou de vale para desconto: a conta que existia tem que sair
    return remover(chave.origem, chave.origemId)
  }

  return gravar(tenantId, {
    ...chave,
    descricao:     descricaoDoLancamento(lanc, nome),
    valor:         lanc.valor,
    vencimento:    lanc.data_prevista,
    pago:          lanc.status === 'PAGO',
    dataPagamento: lanc.data_pagamento,
  })
}

/** Relê o lançamento no banco e espelha — usado por pagar, reabrir e editar */
export async function sincronizarContaPorLancamentoId(tenantId, id) {
  if (!id) return
  const { data } = await supabase
    .from('rh_lancamentos')
    .select('*, funcionarios(nome, apelido)')
    .eq('id', id)
    .maybeSingle()
  if (!data) return
  const nome = data.funcionarios?.apelido || data.funcionarios?.nome || ''
  // Pagar e reabrir não carregam o tenant: vem do próprio registro
  return sincronizarContaLancamento(tenantId || data.tenant_id, data, nome)
}

export async function removerContaDoLancamento(id) {
  if (!id) return
  const { data } = await supabase
    .from('rh_lancamentos').select('id, vt_periodo_id').eq('id', id).maybeSingle()

  // Lançamento gerado a partir de um período de VT divide a chave com ele.
  // Apagar o lançamento não pode levar junto a conta do período, que
  // continua existindo: a conta volta a refletir o período.
  if (data?.vt_periodo_id) return sincronizarContaPorPeriodoVT(null, data.vt_periodo_id)

  return remover('RH_LANC', id)
}

export async function removerContasDoGrupo(grupoId) {
  if (!grupoId) return
  const { data } = await supabase
    .from('rh_lancamentos').select('id, vt_periodo_id').eq('grupo_id', grupoId)
  for (const l of data || []) {
    const chave = chaveDoLancamento(l)
    await remover(chave.origem, chave.origemId)
  }
}

// ── Períodos de vale transporte ────────────────────────────────
export async function sincronizarContaVT(tenantId, periodo, nome) {
  if (!periodo?.id) return
  const total = Number(periodo.total_liquido) || 0
  // Período zerado (ninguém usou o transporte) não vira conta
  if (total <= 0) return remover('RH_VT', periodo.id)

  return gravar(tenantId, {
    origem:        'RH_VT',
    origemId:      periodo.id,
    descricao:     ['Vale transporte', nome, `${fmtData(periodo.data_inicio)} a ${fmtData(periodo.data_fim)}`]
                     .filter(Boolean).join(' — '),
    valor:         total,
    vencimento:    periodo.data_fim,
    pago:          periodo.status === 'PAGO',
    dataPagamento: periodo.data_pagamento,
  })
}

export async function sincronizarContaPorPeriodoVT(tenantId, id) {
  if (!id) return
  const { data } = await supabase
    .from('rh_vt_periodos')
    .select('*, funcionarios(nome, apelido)')
    .eq('id', id)
    .maybeSingle()
  if (!data) return
  const nome = data.funcionarios?.apelido || data.funcionarios?.nome || ''
  return sincronizarContaVT(tenantId || data.tenant_id, data, nome)
}

export async function removerContaDoPeriodoVT(id) {
  return remover('RH_VT', id)
}
