import { exigirUsuario } from './_auth.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  // Até nov/2026 esta rota trocava a senha de QUALQUER usuário sem pedir nada:
  // bastava um POST com o id. Agora quem chama tem que estar logado como quem
  // administra a empresa, e só mexe em gente da própria empresa.
  const { perfil, admin: supabase, erro } = await exigirUsuario(req, ['master', 'admin'])
  if (erro) return res.status(erro.status).json({ error: erro.error })

  const { userId, novaSenha } = req.body || {}

  if (!userId || !novaSenha) {
    return res.status(400).json({ error: 'userId e novaSenha são obrigatórios' })
  }

  if (novaSenha.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' })
  }

  const { data: alvo } = await supabase
    .from('users_perfil')
    .select('id, tenant_id, role, nome')
    .eq('id', userId)
    .maybeSingle()

  if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado' })

  // O master do sistema atende qualquer empresa; o admin, só a dele.
  if (perfil.role !== 'master' && alvo.tenant_id !== perfil.tenant_id) {
    return res.status(403).json({ error: 'Este usuário não é da sua empresa.' })
  }

  // Senha de master só o próprio master troca — senão o admin de uma empresa
  // entraria na conta de quem administra o sistema.
  if (alvo.role === 'master' && perfil.role !== 'master') {
    return res.status(403).json({ error: 'Não é possível trocar a senha desta conta.' })
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password: novaSenha,
  })

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.status(200).json({ ok: true, message: 'Senha resetada com sucesso' })
}
