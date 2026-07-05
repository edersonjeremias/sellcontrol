import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  const { userId, novaSenha } = req.body || {}

  if (!userId || !novaSenha) {
    return res.status(400).json({ error: 'userId e novaSenha são obrigatórios' })
  }

  if (novaSenha.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Atualiza senha do usuário usando service_role
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password: novaSenha,
  })

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.status(200).json({ ok: true, message: 'Senha resetada com sucesso' })
}
