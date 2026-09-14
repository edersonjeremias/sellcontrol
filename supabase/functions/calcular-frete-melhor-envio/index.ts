import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { tenant_id, from, to, package: pkg } = await req.json()

    if (!tenant_id || !from || !to || !pkg) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros obrigatórios: tenant_id, from, to, package' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: config, error: configError } = await supabaseClient
      .from('configuracoes')
      .select('token_melhor_envio, melhor_envio_api_url')
      .eq('tenant_id', tenant_id)
      .single()

    if (configError || !config?.token_melhor_envio) {
      return new Response(
        JSON.stringify({ error: 'Token do Melhor Envio não configurado' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiUrl = config.melhor_envio_api_url || 'https://sandbox.melhorenvio.com.br'
    const token = config.token_melhor_envio

    const melhorEnvioResponse = await fetch(`${apiUrl}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ from, to, package: pkg }),
    })

    if (!melhorEnvioResponse.ok) {
      const errorData = await melhorEnvioResponse.json()
      return new Response(
        JSON.stringify({ error: errorData.message || 'Erro ao calcular frete' }),
        { status: melhorEnvioResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cotacoes = await melhorEnvioResponse.json()

    return new Response(
      JSON.stringify(cotacoes),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
