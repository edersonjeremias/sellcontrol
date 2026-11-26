import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { tenant_id, payload } = req.body || {}
    if (!tenant_id || !payload) {
      return res.status(400).json({ error: 'tenant_id e payload são obrigatórios' })
    }

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Variáveis Supabase não configuradas no servidor' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data: config, error: dbErr } = await supabase
      .from('configuracoes')
      .select('mp_access_token')
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (dbErr) console.error('Supabase erro:', dbErr.message)

    // Só o token DESTA empresa. O fallback para o MP_ACCESS_TOKEN do
    // ambiente saiu em nov/2026: era o token do dono do sistema, e empresa
    // sem token configurado cobrava na conta dele.
    const MP_TOKEN = config?.mp_access_token?.trim() || ''
    if (!MP_TOKEN) {
      return res.status(422).json({ error: 'Token do Mercado Pago não encontrado. Configure-o em Configurações da Empresa.' })
    }

    // ── Quanto cobrar é o banco que diz ──────────────────────────────────────
    // O payload chega montado pelo front, com o unit_price dentro. A página do
    // recibo abre sem login, então dava para pedir um link de R$ 1 para uma
    // cobrança de R$ 300. Quando o external_reference aponta para uma cobrança
    // que já existe, o valor do item é reescrito aqui com o que ela deve.
    //
    // Cobrança que ainda não existe (a tela de Vendas cria a preferência antes
    // de gravar a cobrança) segue com o valor do pedido: não há o que comparar,
    // e um id inventado não dá baixa em nada depois.
    const extRef = String(payload?.external_reference || '')
    const refSplit = extRef.match(/^(.+)-(P[12])$/)
    const idCobranca = refSplit ? refSplit[1] : extRef

    if (/^[0-9a-f-]{36}$/i.test(idCobranca)) {
      const { data: cobranca } = await supabase
        .from('cobrancas')
        .select('total, status, dados_divisao')
        .eq('id', idCobranca)
        .maybeSingle()

      if (cobranca) {
        if (String(cobranca.status || '').toUpperCase() === 'PAGO') {
          return res.status(409).json({ error: 'Esta cobrança já está paga.' })
        }

        const total = Number(cobranca.total || 0)
        let esperado = total

        if (refSplit) {
          // Parte de pagamento dividido: o valor combinado está gravado na
          // cobrança. Na primeira criação ainda não está — aí só exigimos que
          // a parte caiba dentro do total (a soma é conferida ao salvar a
          // divisão, em api/dividir-pagamento.js).
          const chave = refSplit[2] === 'P1' ? 'valor_p1' : 'valor_p2'
          const gravado = Number(cobranca.dados_divisao?.[chave] || 0)

          if (gravado > 0) {
            esperado = gravado
          } else {
            const pedido = Number(payload?.items?.[0]?.unit_price || 0)
            if (!(pedido > 0 && pedido < total)) {
              return res.status(409).json({ error: 'Valor inválido para divisão.' })
            }
            esperado = pedido
          }
        }

        if (!(esperado > 0)) {
          return res.status(409).json({ error: 'Esta cobrança não tem valor a pagar.' })
        }

        payload.items = [{
          ...(payload.items?.[0] || {}),
          quantity: 1,
          currency_id: 'BRL',
          unit_price: Number(esperado.toFixed(2)),
        }]
      }
    }

    const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    // Lê o body como texto primeiro para evitar crash em resposta não-JSON
    const rawText = await mpResp.text()
    let data = {}
    try {
      if (rawText) data = JSON.parse(rawText)
    } catch {
      console.error('MP API resposta não-JSON status', mpResp.status, ':', rawText.slice(0, 300))
      return res.status(502).json({ error: `Mercado Pago retornou resposta inválida (status ${mpResp.status}). Verifique o token e tente novamente.` })
    }

    if (!mpResp.ok) {
      console.error('MP API erro:', mpResp.status, JSON.stringify(data).slice(0, 300))
      return res.status(mpResp.status).json(data)
    }

    return res.status(200).json(data)

  } catch (err) {
    console.error('Erro criar-preferencia-mp:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
