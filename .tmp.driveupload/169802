import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  const { email, password, nome, username, role, tenant_id } = req.body || {}

  if (!password || !nome || !username || !tenant_id) {
    return res.status(400).json({ error: 'Campos obrigatórios: username, senha, nome, tenant_id' })
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' })
  }

  // Username só pode ter letras minúsculas e números
  if (!/^[a-z0-9]+$/.test(username)) {
    return res.status(400).json({ error: 'Username deve conter apenas letras minúsculas e números' })
  }

  // Gera email fictício se não fornecido
  const emailFinal = email?.trim() || `${username}@vmkids.local`

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Verifica se username já existe nesse tenant
  const { data: existente } = await supabase
    .from('users_perfil')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('username', username)
    .single()

  if (existente) {
    return res.status(400).json({ error: 'Username já está em uso nesta empresa' })
  }

  // Cria o usuário no Supabase Auth (já confirma o email automaticamente)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: emailFinal,
    password,
    email_confirm: true,
  })

  if (authError) return res.status(400).json({ error: authError.message })

  // Cria o perfil vinculado ao tenant
  const { error: profileError } = await supabase
    .from('users_perfil')
    .insert([{
      id: authData.user.id,
      tenant_id,
      nome,
      username,
      email: emailFinal,
      role: role || 'vendedor'
    }])

  if (profileError) {
    // Rollback: remove o usuário do auth se o perfil falhou
    await supabase.auth.admin.deleteUser(authData.user.id)
    return res.status(400).json({ error: profileError.message })
  }

  return res.status(200).json({ ok: true, userId: authData.user.id })
}
