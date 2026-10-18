// ============================================================================
// PIX DA COBRANÇA — cliente paga pelo próprio recibo, sem ir ao Mercado Pago
// ============================================================================
// A página /recibo/:id não tem login, então ela manda só o id da cobrança e o
// service role busca o valor no banco. O valor NUNCA vem do cliente.
//
// Quem confirma o pagamento é a função mercadopago-webhook: mandamos o id da
// cobrança em external_reference, que é o que ela já usa para dar baixa.
//
// POST { cobranca_id }
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const MINUTOS_VALIDADE = 30
const PAGOS = ['PAGO', 'BAIXADO']

/** Instante daqui a N minutos escrito no fuso de Brasília, como o MP espera */
function expiraEm(minutos: number) {
  const brt = new Date(Date.now() + minutos * 60_000 - 3 * 60 * 60 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${brt.getUTCFullYear()}-${p(brt.getUTCMonth() + 1)}-${p(brt.getUTCDate())}` +
    `T${p(brt.getUTCHours())}:${p(brt.getUTCMinutes())}:${p(brt.getUTCSeconds())}.000-03:00`
}

/** O MP recusa o pagamento inteiro se o CPF for inválido, então só mandamos o que passa */
function cpfValido(valor: string) {
  const cpf = String(valor || '').replace(/\D/g, '')
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

  for (const corte of [9, 10]) {
    let soma = 0
    for (let i = 0; i < corte; i++) soma += Number(cpf[i]) * (corte + 1 - i)
    let digito = (soma * 10) % 11
    if (digito === 10) digito = 0
    if (digito !== Number(cpf[corte])) return false
  }
  return true
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { cobranca_id } = await req.json()
    if (!cobranca_id) return json({ error: 'cobranca_id é obrigatório' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: cobranca, error: cobErro } = await supabase
      .from('cobrancas')
      .select('*')
      .eq('id', cobranca_id)
      .maybeSingle()

    if (cobErro) {
      console.error('Erro ao buscar cobrança:', cobErro)
      return json({ error: 'Erro ao carregar o pedido' }, 500)
    }
    if (!cobranca) return json({ error: 'Pedido não encontrado' }, 404)
    if (PAGOS.includes(String(cobranca.status))) {
      return json({ error: 'Este pedido já foi pago' }, 409)
    }

    const total = Number(cobranca.total)
    if (!(total > 0)) return json({ error: 'Valor do pedido inválido' }, 422)

    // PIX anterior ainda válido e do mesmo valor: devolve o mesmo QR Code em vez
    // de encher a conta do MP de pagamentos pendentes a cada abertura da tela
    const aindaVale =
      cobranca.pix_qr_code &&
      cobranca.pix_expiracao &&
      new Date(cobranca.pix_expiracao) > new Date() &&
      Number(cobranca.pix_valor) === Number(total.toFixed(2))

    if (aindaVale) {
      return json({
        qr_code: cobranca.pix_qr_code,
        qr_code_base64: cobranca.pix_qr_code_base64,
        expiracao: cobranca.pix_expiracao,
        valor: Number(cobranca.pix_valor),
        payment_id: cobranca.pix_payment_id,
        reaproveitado: true,
      })
    }

    const { data: config } = await supabase
      .from('configuracoes')
      .select('mp_access_token, nome_loja')
      .eq('tenant_id', cobranca.tenant_id)
      .maybeSingle()

    const token = String(config?.mp_access_token || '').trim()
    if (!token) {
      return json({ error: 'A loja ainda não configurou o pagamento. Fale com a loja.' }, 422)
    }

    // PIX antigo (valor mudou por cupom, ou expirado): cancela no MP para o
    // cliente não conseguir pagar um QR Code com o valor errado
    if (cobranca.pix_payment_id) {
      try {
        await fetch(`https://api.mercadopago.com/v1/payments/${cobranca.pix_payment_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'cancelled' }),
        })
      } catch (e) {
        console.error('Não foi possível cancelar o PIX anterior:', e)
      }
    }

    const pagador = await dadosPagador(supabase, cobranca)

    const payload: Record<string, unknown> = {
      transaction_amount: Number(total.toFixed(2)),
      description: `Pedido #${String(cobranca.id).slice(0, 8).toUpperCase()} — ${config?.nome_loja || 'Loja'}`,
      payment_method_id: 'pix',
      external_reference: String(cobranca.id),
      notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
      date_of_expiration: expiraEm(MINUTOS_VALIDADE),
      payer: pagador,
    }

    const mpResp = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    })

    const pagamento = await mpResp.json().catch(() => ({}))

    if (!mpResp.ok) {
      console.error('Erro MP ao criar PIX:', mpResp.status, JSON.stringify(pagamento).slice(0, 500))
      return json({ error: 'Não foi possível gerar o PIX agora. Tente de novo em instantes.' }, 502)
    }

    const dados = pagamento?.point_of_interaction?.transaction_data
    if (!dados?.qr_code) {
      console.error('MP não devolveu QR Code:', JSON.stringify(pagamento).slice(0, 500))
      return json({ error: 'O Mercado Pago não devolveu o QR Code. Tente de novo.' }, 502)
    }

    const expiracao = pagamento.date_of_expiration
      ? new Date(pagamento.date_of_expiration).toISOString()
      : new Date(Date.now() + MINUTOS_VALIDADE * 60_000).toISOString()

    const { error: upErro } = await supabase
      .from('cobrancas')
      .update({
        pix_qr_code: dados.qr_code,
        pix_qr_code_base64: dados.qr_code_base64 || null,
        pix_expiracao: expiracao,
        pix_payment_id: String(pagamento.id),
        pix_valor: Number(total.toFixed(2)),
      })
      .eq('id', cobranca.id)

    if (upErro) console.error('Erro ao salvar o PIX na cobrança:', upErro)

    return json({
      qr_code: dados.qr_code,
      qr_code_base64: dados.qr_code_base64 || null,
      expiracao,
      valor: Number(total.toFixed(2)),
      payment_id: String(pagamento.id),
    })
  } catch (error) {
    console.error('Erro geral:', error)
    return json({ error: (error as Error).message }, 500)
  }
})

/**
 * Dados do pagador exigidos pelo PIX. O cadastro do cliente varia de schema
 * entre instalações (colunas próprias ou o jsonb legado `detalhes`), então
 * pedimos a linha inteira e aproveitamos o que existir.
 */
async function dadosPagador(supabase: any, cobranca: any) {
  const instagram = String(cobranca.cliente || '').replace('@', '').trim()

  const slug = instagram
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '') || 'cliente'

  const pagador: Record<string, unknown> = {
    email: `${slug}@vmkids.com.br`,
    first_name: instagram || 'Cliente',
  }

  const { data } = await supabase
    .from('clientes')
    .select('*')
    .eq('tenant_id', cobranca.tenant_id)
    .ilike('instagram', instagram)
    .limit(1)

  const cliente = (data || [])[0]
  if (!cliente) return pagador

  const extra = cliente.detalhes && typeof cliente.detalhes === 'object' ? cliente.detalhes : {}

  const email = String(cliente.email || extra.email || '').trim()
  if (email.includes('@')) pagador.email = email.toLowerCase()

  const nome = String(cliente.nome_completo || extra.nomeCompleto || cliente.nome || '').trim()
  if (nome) {
    const partes = nome.split(/\s+/)
    pagador.first_name = partes[0]
    if (partes.length > 1) pagador.last_name = partes.slice(1).join(' ')
  }

  const cpf = String(cliente.cpf || cliente.cpf_cnpj || extra.cpf || '').replace(/\D/g, '')
  if (cpfValido(cpf)) {
    pagador.identification = { type: 'CPF', number: cpf }
  }

  return pagador
}
