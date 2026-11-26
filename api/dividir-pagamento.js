import { createClient } from '@supabase/supabase-js'

// Grava a divisão de uma cobrança em duas partes. As preferências do Mercado
// Pago já foram criadas (api/criar-preferencia-mp), aqui só fica registrado
// quanto é cada parte e qual link abre cada uma.
//
// A rota é aberta de propósito: quem divide o pagamento é a cliente, na página
// do recibo, sem login. Por isso nada do que chega é gravado como veio —
// até nov/2026 o `dados_divisao` do corpo ia direto para a tabela, e dava para
// mandar `{status_p1:'PAGO', status_p2:'PAGO'}` ou duas partes de R$ 1 numa
// cobrança de R$ 300.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { idCobranca, dados_divisao } = req.body || {}

    if (!idCobranca || !dados_divisao) {
      return res.status(400).json({ error: 'idCobranca e dados_divisao são obrigatórios' })
    }

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Variáveis Supabase não configuradas' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { data: cobranca } = await supabase
      .from('cobrancas')
      .select('id, total, status, dados_divisao')
      .eq('id', idCobranca)
      .maybeSingle()

    if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada' })

    const status = String(cobranca.status || '').toUpperCase()
    if (status === 'PAGO' || status === 'CANCELADO') {
      return res.status(409).json({ error: 'Esta cobrança já foi finalizada.' })
    }

    // Parte já paga não se redivide: o dinheiro de uma das metades já entrou.
    const atual = cobranca.dados_divisao || {}
    if (atual.status_p1 === 'PAGO' || atual.status_p2 === 'PAGO') {
      return res.status(409).json({ error: 'Uma das partes já foi paga. Não é possível dividir de novo.' })
    }

    const total = Number(cobranca.total || 0)
    const v1 = Number(dados_divisao.valor_p1)
    const v2 = Number(dados_divisao.valor_p2)

    if (!(v1 > 0) || !(v2 > 0)) {
      return res.status(409).json({ error: 'As duas partes precisam ter valor.' })
    }

    // Um centavo de folga para o arredondamento das metades.
    if (Math.abs(v1 + v2 - total) > 0.011) {
      return res.status(409).json({
        error: 'A soma das duas partes tem que fechar com o total da cobrança.',
      })
    }

    // Só estes campos são gravados, e o status das partes nasce PENDENTE: quem
    // marca uma parte como paga é a função process_split_payment, chamada pelo
    // webhook do Mercado Pago depois de confirmar o pagamento na conta.
    const limpo = {
      valor_p1: Number(v1.toFixed(2)),
      valor_p2: Number(v2.toFixed(2)),
      link_p1: String(dados_divisao.link_p1 || ''),
      link_p2: String(dados_divisao.link_p2 || ''),
      id_mp_pref_p1: String(dados_divisao.id_mp_pref_p1 || ''),
      id_mp_pref_p2: String(dados_divisao.id_mp_pref_p2 || ''),
      status_p1: 'PENDENTE',
      status_p2: 'PENDENTE',
    }

    const { error } = await supabase
      .from('cobrancas')
      .update({ dados_divisao: limpo })
      .eq('id', idCobranca)

    if (error) throw error

    return res.status(200).json({ ok: true, dados_divisao: limpo })

  } catch (err) {
    console.error('Erro dividir-pagamento:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
