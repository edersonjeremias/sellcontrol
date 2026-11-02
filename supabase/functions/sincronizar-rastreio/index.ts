// ============================================================================
// SINCRONIZAR RASTREIO — busca o código de rastreio no Melhor Envio
// ============================================================================
// O código não existe no momento em que a etiqueta é gerada: o Melhor Envio
// só o devolve depois, quando a transportadora registra o objeto. Por isso o
// romaneio ficava despachado e sem rastreio para sempre.
//
// POST { tenant_id, romaneio_id? , cliente_instagram? }
//   Sem filtro extra, varre os romaneios do tenant que ainda não têm código.
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

// Status em que o objeto já existe na transportadora
const RASTREAVEIS = ['etiqueta_gerada', 'despachado', 'em_transito']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { tenant_id, romaneio_id, cliente_instagram } = await req.json()
    if (!tenant_id) return json({ error: 'tenant_id é obrigatório' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: config } = await supabase
      .from('configuracoes')
      .select('token_melhor_envio, melhor_envio_api_url')
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (!config?.token_melhor_envio) {
      return json({ atualizados: 0, motivo: 'Melhor Envio não configurado' })
    }

    let query = supabase
      .from('romaneios')
      .select('id, numero, status, codigo_rastreio, despachado_em, melhor_envio_order_id')
      .eq('tenant_id', tenant_id)
      .not('melhor_envio_order_id', 'is', null)
      .in('status', RASTREAVEIS)
      .limit(60)


    if (romaneio_id) query = query.eq('id', romaneio_id)
    if (cliente_instagram) query = query.eq('cliente_instagram', String(cliente_instagram).replace('@', ''))

    const { data: pendentes, error } = await query

    if (error) {
      console.error('Erro ao buscar romaneios:', error)
      return json({ error: 'Erro ao buscar romaneios' }, 500)
    }

    if (!pendentes?.length) return json({ atualizados: 0 })

    const apiUrl = config.melhor_envio_api_url || 'https://sandbox.melhorenvio.com.br'
    const orders = pendentes.map(r => r.melhor_envio_order_id)

    const resp = await fetch(`${apiUrl}/api/v2/me/shipment/tracking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${config.token_melhor_envio}`,
      },
      body: JSON.stringify({ orders }),
    })

    if (!resp.ok) {
      const erro = await resp.json().catch(() => ({}))
      console.error('Erro no tracking do Melhor Envio:', erro)
      return json({ atualizados: 0, motivo: erro.message || 'Melhor Envio não respondeu' })
    }

    // A resposta vem como { "<order_id>": { tracking, status, ... } }
    const dados = await resp.json()

    let atualizados = 0
    let despachados = 0
    let entregues = 0

    for (const romaneio of pendentes) {
      const info = dados?.[romaneio.melhor_envio_order_id]
      if (!info) continue

      const updates: Record<string, unknown> = {}

      const codigo = info.tracking || info.melhorenvio_tracking || null
      if (codigo && !romaneio.codigo_rastreio) updates.codigo_rastreio = codigo

      // A transportadora registrou a postagem: o pacote saiu da loja
      if (info.posted_at && romaneio.status === 'etiqueta_gerada') {
        updates.status = 'despachado'
        updates.despachado_em = info.posted_at
      }

      // Entrega confirmada tem precedência sobre a postagem
      if (info.delivered_at && romaneio.status !== 'entregue') {
        updates.status = 'entregue'
        updates.entregue_em = info.delivered_at
        if (!romaneio.despachado_em && info.posted_at) updates.despachado_em = info.posted_at
      }

      if (!Object.keys(updates).length) continue

      const { error: upError } = await supabase
        .from('romaneios')
        .update(updates)
        .eq('id', romaneio.id)

      if (upError) {
        console.error(`Erro ao atualizar ${romaneio.numero}:`, upError)
        continue
      }

      if (updates.codigo_rastreio) atualizados++
      if (updates.status === 'despachado') despachados++
      if (updates.status === 'entregue') entregues++
    }

    console.log(`📍 Rastreios: ${atualizados} | despachados: ${despachados} | entregues: ${entregues}`)
    return json({ atualizados, despachados, entregues, verificados: pendentes.length })
  } catch (error) {
    console.error('Erro:', error)
    return json({ error: (error as Error).message }, 500)
  }
})
