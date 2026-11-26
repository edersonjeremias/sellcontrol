// ============================================================================
// APLICAR CUPOM NA COBRANÇA — valor quem decide é o servidor
// ============================================================================
// Esta rota é aberta de propósito: quem aplica o cupom é a cliente, na página
// do recibo (/r/<codigo>), sem login. O id da cobrança é a credencial, como no
// link de frete.
//
// Até nov/2026 ela gravava o que viesse no corpo do pedido — `total`,
// `cupom_desconto_valor`, tudo. Ou seja: quem tinha o link do recibo zerava a
// própria dívida com um POST. Agora o corpo só diz QUAL cupom; o desconto e o
// total novo são calculados aqui, a partir do que está no banco.
// ============================================================================

import { createClient } from '@supabase/supabase-js'

// Mesmas regras de statusCupom em src/services/cuponsService.js. O fuso é
// fixo em -03:00 porque o cupom é cadastrado no horário de Brasília e o
// servidor da Vercel roda em UTC.
function cupomVigente(cupom) {
  const agora = new Date()
  const hhmm = (valor, padrao) => String(valor || padrao).slice(0, 5)
  const inicio = new Date(`${cupom.data_inicio}T${hhmm(cupom.hora_inicio, '00:00')}:00-03:00`)
  const fim    = new Date(`${cupom.data_fim}T${hhmm(cupom.hora_fim, '23:59')}:59-03:00`)

  const temLimite = cupom.limite_usos !== null && cupom.limite_usos !== undefined
  if (temLimite && (cupom.usos_realizados || 0) >= cupom.limite_usos) return 'CUPOM ESGOTADO'
  if (agora < inicio) return 'Cupom ainda não está válido'
  if (agora > fim) return 'Cupom expirado'
  return null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { cobrancaId, codigo, link_mp, id_mp, remover } = req.body || {}

    if (!cobrancaId) return res.status(400).json({ error: 'cobrancaId é obrigatório' })
    if (!remover && !String(codigo || '').trim()) {
      return res.status(400).json({ error: 'Digite o código do cupom' })
    }

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Variáveis Supabase não configuradas' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { data: cobranca } = await supabase
      .from('cobrancas')
      .select('id, tenant_id, total, status, cupom_id, cupom_desconto_valor')
      .eq('id', cobrancaId)
      .maybeSingle()

    if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada' })

    // Cobrança paga não muda de valor: o dinheiro já entrou.
    const status = String(cobranca.status || '').toUpperCase()
    if (status === 'PAGO' || status === 'CANCELADO') {
      return res.status(409).json({ error: 'Esta cobrança já foi finalizada.' })
    }

    // Tirar o cupom devolve o valor cheio. Isso vinha sendo feito direto do
    // navegador, e a RLS só deixa a página pública LER cobranças: o cupom
    // saía da tela e o total descontado ficava gravado no banco.
    if (remover) {
      const descontoGravado = Number(cobranca.cupom_desconto_valor || 0)
      const totalCheio = Number(cobranca.total || 0) + descontoGravado

      const { error } = await supabase
        .from('cobrancas')
        .update({
          cupom_codigo: null,
          cupom_desconto_percentual: null,
          cupom_desconto_valor: null,
          cupom_id: null,
          total: totalCheio,
        })
        .eq('id', cobrancaId)

      if (error) {
        console.error('Erro ao remover cupom:', error)
        return res.status(500).json({ error: error.message })
      }

      return res.status(200).json({ ok: true, removido: true, total: totalCheio })
    }

    const { data: cupom } = await supabase
      .from('cupons')
      .select('*')
      .eq('tenant_id', cobranca.tenant_id)
      .eq('ativo', true)
      .ilike('codigo', String(codigo).trim())
      .maybeSingle()

    if (!cupom) return res.status(404).json({ error: 'Cupom não encontrado ou inválido' })

    const problema = cupomVigente(cupom)
    if (problema) return res.status(409).json({ error: problema })

    // Trocar de cupom é permitido, e o desconto novo incide sobre o valor
    // cheio — não sobre o já descontado, senão dois cupons se somariam.
    const descontoAtual = Number(cobranca.cupom_desconto_valor || 0)
    const totalCheio = Number(cobranca.total || 0) + descontoAtual

    const percentual = Number(cupom.percentual || 0)
    if (!(percentual > 0 && percentual <= 100)) {
      return res.status(409).json({ error: 'Cupom com desconto inválido. Avise a loja.' })
    }

    const desconto = Number(((totalCheio * percentual) / 100).toFixed(2))
    const totalFinal = Number((totalCheio - desconto).toFixed(2))

    const atualizacao = {
      cupom_codigo: cupom.codigo,
      cupom_desconto_percentual: percentual,
      cupom_desconto_valor: desconto,
      cupom_id: cupom.id,
      total: totalFinal,
    }

    // O link do Mercado Pago é gerado depois, com o total já calculado aqui;
    // quando ele vem junto, é só para ficar guardado na cobrança.
    if (link_mp) atualizacao.link_mp = link_mp
    if (id_mp) atualizacao.id_mp = String(id_mp)

    const { data, error } = await supabase
      .from('cobrancas')
      .update(atualizacao)
      .eq('id', cobrancaId)
      .select()

    if (error) {
      console.error('Erro ao aplicar cupom:', error)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({
      ok: true,
      data,
      codigo: cupom.codigo,
      percentual,
      desconto,
      total: totalFinal,
      total_cheio: totalCheio,
      cupom: {
        id: cupom.id,
        data_inicio: cupom.data_inicio,
        data_fim: cupom.data_fim,
        hora_inicio: cupom.hora_inicio,
        hora_fim: cupom.hora_fim,
      },
    })

  } catch (err) {
    console.error('Erro aplicar-cupom:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
