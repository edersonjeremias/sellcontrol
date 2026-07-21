import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Payload = {
  empresaNome: string
  empresaCnpj: string
  adminNome: string
  adminEmail: string
  adminCpf: string
  adminCelular: string
  adminSenha: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl      = Deno.env.get('SUPABASE_URL')              ?? ''
    const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Variáveis SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas.')
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Valida o JWT do usuário chamador
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) {
      return new Response(JSON.stringify({ ok: false, message: 'Não autenticado.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(jwt)
    if (authError || !caller) {
      return new Response(JSON.stringify({ ok: false, message: `Token inválido: ${authError?.message ?? 'sem usuário'}` }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: requester, error: requesterError } = await supabaseAdmin
      .from('users_perfil').select('id, role').eq('id', caller.id).single()

    if (requesterError || !requester || requester.role !== 'master') {
      return new Response(JSON.stringify({
        ok: false,
        message: `Acesso negado. Role: "${requester?.role ?? 'nenhuma'}". ${requesterError?.message ?? ''}`,
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body          = (await req.json()) as Payload
    const empresaNome   = body.empresaNome?.trim()
    const empresaCnpj   = body.empresaCnpj?.trim()
    const adminNome     = body.adminNome?.trim()
    const adminEmail    = body.adminEmail?.trim().toLowerCase()
    const adminCpf      = body.adminCpf?.trim()
    const adminCelular  = body.adminCelular?.trim()
    const adminSenha    = body.adminSenha ?? ''

    if (!empresaNome || !adminNome || !adminEmail || !adminCelular) {
      return new Response(JSON.stringify({ ok: false, message: 'Dados obrigatórios não informados.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (adminSenha.length < 6) {
      return new Response(JSON.stringify({ ok: false, message: 'Senha inicial deve ter no mínimo 6 caracteres.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Cria o tenant (users_perfil.tenant_id tem FK para tenants.id)
    const { data: tenantData, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert([{ nome: empresaNome, cnpj: empresaCnpj, contato_celular: adminCelular, plano: 'basico', ativo: true }])
      .select('id')
      .single()

    if (tenantError || !tenantData) {
      throw new Error(`Erro ao criar tenant: ${tenantError?.message ?? 'sem dados'}`)
    }
    const tenantId = tenantData.id

    // 2. Cria a configuração da empresa (nome_loja visível no sistema)
    const { error: configError } = await supabaseAdmin
      .from('configuracoes')
      .insert([{ tenant_id: tenantId, nome_loja: empresaNome, email_contato: adminEmail, whatsapp: adminCelular }])

    if (configError) {
      await supabaseAdmin.from('tenants').delete().eq('id', tenantId)
      throw new Error(`Erro ao criar configuracoes: ${configError.message}`)
    }

    // 3. Cria o usuário admin no Auth
    const { data: userCreated, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email:         adminEmail,
      password:      adminSenha,
      email_confirm: true,
      user_metadata: { nome: adminNome, cpf: adminCpf, celular: adminCelular },
    })

    if (userError || !userCreated.user) {
      await supabaseAdmin.from('configuracoes').delete().eq('tenant_id', tenantId)
      await supabaseAdmin.from('tenants').delete().eq('id', tenantId)
      throw new Error(`Erro ao criar usuário no Auth: ${userError?.message ?? 'sem usuário'}`)
    }

    // 4. Cria o perfil em users_perfil
    const { error: profileError } = await supabaseAdmin
      .from('users_perfil')
      .insert([{
        id:        userCreated.user.id,
        tenant_id: tenantId,
        role:      'admin',
        nome:      adminNome,
        email:     adminEmail,
        cpf:       adminCpf,
        celular:   adminCelular,
      }])

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userCreated.user.id)
      await supabaseAdmin.from('configuracoes').delete().eq('tenant_id', tenantId)
      await supabaseAdmin.from('tenants').delete().eq('id', tenantId)
      throw new Error(`Erro ao criar perfil em users_perfil: ${profileError.message}`)
    }

    return new Response(JSON.stringify({ ok: true, tenantId, adminId: userCreated.user.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, message: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
