// ============================================================================
// CANCELAR COBRANÇA — usada quando a venda é estornada
// ============================================================================
// Marcar CANCELADO no banco não basta: o link do Checkout Pro continua
// pagável e o PIX pendente também. Aqui a gente derruba os dois no Mercado
// Pago antes de mexer no status.
//
// Roda com service role de propósito: quem estorna é a tela de Vendas, que
// não precisa ter permissão de escrita em cobranças.
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

const PAGOS = ['PAGO', 'BAIXADO']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { cobranca_id } = await req.json()
    if (!cobranca_id) return json({ error: 'cobranca_id é obrigatório' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: cobranca, error: erroBusca } = await supabase
      .from('cobrancas')
      .select('id, tenant_id, status, id_mp, pix_payment_id')
      .eq('id', cobranca_id)
      .maybeSingle()

    if (erroBusca) {
      console.error('Erro ao buscar cobrança:', erroBusca)
      return json({ error: 'Erro ao carregar a cobrança' }, 500)
    }
    if (!cobranca) return json({ error: 'Cobrança não encontrada' }, 404)

    if (PAGOS.includes(String(cobranca.status))) {
      return json({ error: 'Esta cobrança já foi paga e não pode ser cancelada' }, 409)
    }
    if (String(cobranca.status) === 'CANCELADO') {
      return json({ ok: true, ja_cancelada: true })
    }

    const { data: config } = await supabase
      .from('configuracoes')
      .select('mp_access_token')
      .eq('tenant_id', cobranca.tenant_id)
      .maybeSingle()

    const token = String(config?.mp_access_token || '').trim()
    const avisos: string[] = []

    if (token) {
      // Link do Checkout Pro: expira com data no passado
      if (cobranca.id_mp) {
        const passado = new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, '.000-00:00')
        try {
          const r = await fetch(`https://api.mercadopago.com/checkout/preferences/${cobranca.id_mp}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ expires: true, expiration_date_to: passado }),
          })
          if (!r.ok) {
            const txt = await r.text()
            console.error('MP recusou expirar a preferência:', r.status, txt.slice(0, 300))
            avisos.push('link_nao_expirado')
          }
        } catch (e) {
          console.error('Falha ao expirar preferência:', e)
          avisos.push('link_nao_expirado')
        }
      }

      // PIX pendente do recibo
      if (cobranca.pix_payment_id) {
        try {
          const r = await fetch(`https://api.mercadopago.com/v1/payments/${cobranca.pix_payment_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: 'cancelled' }),
          })
          if (!r.ok) {
            const txt = await r.text()
            console.error('MP recusou cancelar o PIX:', r.status, txt.slice(0, 300))
            avisos.push('pix_nao_cancelado')
          }
        } catch (e) {
          console.error('Falha ao cancelar PIX:', e)
          avisos.push('pix_nao_cancelado')
        }
      }
    } else {
      avisos.push('sem_token_mp')
    }

    const { error: erroUpdate } = await supabase
      .from('cobrancas')
      .update({
        status: 'CANCELADO',
        link_mp: '',
        pix_qr_code: null,
        pix_qr_code_base64: null,
        pix_expiracao: null,
        pix_payment_id: null,
        pix_valor: null,
      })
      .eq('id', cobranca.id)
      .not('status', 'in', '("PAGO","BAIXADO")')

    if (erroUpdate) {
      console.error('Erro ao cancelar a cobrança:', erroUpdate)
      return json({ error: 'Não foi possível cancelar a cobrança' }, 500)
    }

    return json({ ok: true, avisos })
  } catch (error) {
    console.error('Erro geral:', error)
    return json({ error: (error as Error).message }, 500)
  }
})
