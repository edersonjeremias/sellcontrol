// ================================================================
// EDGE FUNCTION: receber-pedido-live
// Recebe o webhook do ManyChat e preenche o cliente na venda
// ================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Verificação de segurança ──────────────────────────────
    // O ManyChat envia o secret no header x-webhook-secret
    const secret = req.headers.get('x-webhook-secret')
    if (secret !== Deno.env.get('WEBHOOK_SECRET')) {
      return json({ ok: false, erro: 'Não autorizado' }, 401)
    }

    // ── Leitura do body ───────────────────────────────────────
    const body = await req.json()
    const { instagram_username, codigo_peca, manychat_id, nome_completo } = body

    if (!instagram_username || !codigo_peca) {
      return json({ ok: false, erro: 'instagram_username e codigo_peca são obrigatórios' }, 400)
    }

    const instagramLower = instagram_username.trim().toLowerCase()
    const codigoLimpo    = codigo_peca.trim()

    // ── Cliente Supabase com service_role (ignora RLS) ────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const tenantId = Deno.env.get('TENANT_ID')!

    // ── Busca a venda com este código, sem cliente, pendente ──
    const { data: vendas, error: errBusca } = await supabase
      .from('vendas')
      .select('id, codigo, produto, sacolinha')
      .eq('tenant_id', tenantId)
      .eq('codigo', codigoLimpo)
      .eq('status', '')
      .eq('cliente_nome', '')   // só pega se ainda não tem cliente
      .order('created_at', { ascending: false })
      .limit(1)

    if (errBusca) throw errBusca

    if (!vendas || vendas.length === 0) {
      return json({
        ok: false,
        erro: `Peça código ${codigoLimpo} não encontrada ou já reservada.`,
      }, 404)
    }

    const venda = vendas[0]

    // ── UPDATE atômico: só atualiza se cliente ainda estiver vazio ──
    // Isso garante "quem chegar primeiro leva" mesmo com comentários simultâneos
    const { data: atualizado, error: errUpdate } = await supabase
      .from('vendas')
      .update({ cliente_nome: instagramLower })
      .eq('id', venda.id)
      .eq('cliente_nome', '')   // condição atômica — PostgreSQL ACID
      .eq('status', '')
      .select('id')

    if (errUpdate) throw errUpdate

    if (!atualizado || atualizado.length === 0) {
      // Outra requisição chegou no mesmo milissegundo e ganhou
      return json({
        ok: false,
        erro: `Peça ${codigoLimpo} já foi reservada por outra pessoa segundos antes!`,
      }, 409)
    }

    // ── Sucesso ───────────────────────────────────────────────
    console.log(`✅ Peça ${codigoLimpo} reservada para @${instagramLower} | venda: ${venda.id}`)

    return json({
      ok: true,
      mensagem: `Peça ${venda.produto || codigoLimpo} reservada na sua sacolinha! 🛍️`,
      codigo: codigoLimpo,
      instagram: instagramLower,
    })

  } catch (err) {
    console.error('Erro na edge function:', err)
    return json({ ok: false, erro: String(err) }, 500)
  }
})

// Helper
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
