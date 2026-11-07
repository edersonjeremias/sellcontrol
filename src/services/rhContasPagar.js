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

// A conta a pagar é espelho: se falhar, o lançamento do RH não pode ser
// perdido junto. Mas falhar calado também não serve — foi assim que o
// espelho ficou quebrado sem ninguém perceber. O aviso fica guardado aqui
// e a tela mostra depois de salvar.
let aviso = null

/** Lê e limpa o último aviso de espelho. Chamado pelas abas após salvar. */
export function consumirAvisoConta() {
  const a = aviso
  aviso = null
  return a
}

function registrarFalha(error) {
  console.error('Conta a pagar do RH', error)
  aviso = semColunaOrigem(error)
    ? 'Lançamento salvo, mas o Contas a Pagar não foi atualizado: falta rodar a migração 20261107_contas_pagar_origem.'
    : 'Lançamento salvo, mas o Contas a Pagar não foi atualizado: ' + (error?.message || 'erro desconhecido')
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

  if (!error) return

  // 42P10: o banco não tem o índice único que o ON CONFLICT precisa casar —
  // é o que acontece quando o índice está como parcial. Em vez de perder a
  // conta, procura e grava em dois passos.
  if (error.code === '42P10') return gravarEmDoisPassos(linha)

  registrarFalha(error)
}

async function gravarEmDoisPassos(linha) {
  const { data, error: errBusca } = await supabase
    .from('contas_pagar')
    .select('id')
    .eq('tenant_id', linha.tenant_id)
    .eq('origem', linha.origem)
    .eq('origem_id', linha.origem_id)
    .maybeSingle()

  if (errBusca) return registrarFalha(errBusca)

  const { error } = data?.id
    ? await supabase.from('contas_pagar').update(linha).eq('id', data.id)
    : await supabase.from('contas_pagar').insert([linha])

  if (error) registrarFalha(error)
}

async function remover(origem, origemId) {
  if (!origemId) return
  const { error } = await supabase.from('contas_pagar')
    .delete().eq('origem', origem).eq('origem_id', origemId)
  if (error) registrarFalha(error)
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
