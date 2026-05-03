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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error('Variáveis de ambiente do Supabase não configuradas na função.')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, message: 'Não autenticado.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const { data: authData, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ ok: false, message: 'Token inválido.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const requesterId = authData.user.id
    const { data: requester, error: requesterError } = await supabaseAdmin
      .from('users_perfil')
      .select('id, role')
      .eq('id', requesterId)
      .single()

    if (requesterError || !requester || requester.role !== 'master') {
      return new Response(JSON.stringify({ ok: false, message: 'Apenas usuário master pode criar empresas.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = (await req.json()) as Payload
    const empresaNome = body.empresaNome?.trim()
    const empresaCnpj = body.empresaCnpj?.trim()
    const adminNome = body.adminNome?.trim()
    const adminEmail = body.adminEmail?.trim().toLowerCase()
    const adminCpf = body.adminCpf?.trim()
    const adminCelular = body.adminCelular?.trim()
    const adminSenha = body.adminSenha ?? ''

    if (!empresaNome || !empresaCnpj || !adminNome || !adminEmail || !adminCpf || !adminCelular) {
      return new Response(JSON.stringify({ ok: false, message: 'Dados obrigatórios não informados.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (adminSenha.length < 6) {
      return new Response(JSON.stringify({ ok: false, message: 'Senha inicial do administrador deve ter no mínimo 6 caracteres.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Gera UUID para o novo tenant
    const tenantId = crypto.randomUUID()

    // Cria a linha em configuracoes (tabela usada como registro mestre do tenant)
    const { error: configError } = await supabaseAdmin
      .from('configuracoes')
      .insert([{
        tenant_id: tenantId,
        nome_loja: empresaNome,
        email_contato: adminEmail,
        whatsapp: adminCelular,
      }])

    if (configError) {
      throw new Error(configError.message || 'Não foi possível criar a empresa.')
    }

    // Cria o usuário admin no Auth
    const { data: userCreated, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminSenha,
      email_confirm: true,
      user_metadata: {
        nome: adminNome,
        cpf: adminCpf,
        celular: adminCelular,
      },
    })

    if (userError || !userCreated.user) {
      // Rollback: remove a linha de configuracoes criada
      await supabaseAdmin.from('configuracoes').delete().eq('tenant_id', tenantId)
      throw new Error(userError?.message || 'Não foi possível criar usuário no Auth.')
    }

    // Cria o perfil do admin em users_perfil
    const { error: profileError } = await supabaseAdmin
      .from('users_perfil')
      .insert([{
        id: userCreated.user.id,
        tenant_id: tenantId,
        role: 'admin',
        nome: adminNome,
        email: adminEmail,
        cpf: adminCpf,
        celular: adminCelular,
      }])

    if (profileError) {
      // Rollback: remove user e configuracoes
      await supabaseAdmin.auth.admin.deleteUser(userCreated.user.id)
      await supabaseAdmin.from('configuracoes').delete().eq('tenant_id', tenantId)
      throw new Error(profileError.message || 'Usuário criado, mas falhou ao criar perfil.')
    }

    return new Response(JSON.stringify({ ok: true, tenantId, adminId: userCreated.user.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, message: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
