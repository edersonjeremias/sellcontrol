// ============================================================================
// QUEM ESTÁ CHAMANDO — verificação de identidade das rotas de api/
// ============================================================================
// As rotas desta pasta rodam com SUPABASE_SERVICE_ROLE_KEY, que ignora toda a
// RLS. Sem conferir quem chamou, elas eram um buraco aberto: criar usuário
// master em qualquer empresa ou trocar a senha de qualquer pessoa era um POST.
//
// Arquivo com `_` no nome não vira rota na Vercel: é só um ajudante.
//
// Uso:
//   const { perfil, admin, erro } = await exigirUsuario(req, ['master', 'admin'])
//   if (erro) return res.status(erro.status).json({ error: erro.error })
//
// `perfil` traz id, tenant_id e role de quem chamou — é por ele que a rota
// decide o que a pessoa pode fazer, nunca pelo que vem no corpo do pedido.
// ============================================================================

import { createClient } from '@supabase/supabase-js'

export function clienteAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function exigirUsuario(req, rolesPermitidos = null) {
  const cabecalho = req.headers.authorization || ''
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : ''

  if (!token) {
    return { erro: { status: 401, error: 'Faça login no sistema e tente de novo.' } }
  }

  const admin = clienteAdmin()

  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) {
    return { erro: { status: 401, error: 'Sessão expirada. Entre no sistema de novo.' } }
  }

  const { data: perfil } = await admin
    .from('users_perfil')
    .select('id, tenant_id, role, ativo, nome')
    .eq('id', user.id)
    .maybeSingle()

  if (!perfil) {
    return { erro: { status: 403, error: 'Esta conta não tem acesso ao sistema.' } }
  }
  if (perfil.ativo === false) {
    return { erro: { status: 403, error: 'Esta conta está inativa.' } }
  }
  if (rolesPermitidos && !rolesPermitidos.includes(perfil.role)) {
    return { erro: { status: 403, error: 'Sua conta não tem permissão para isso.' } }
  }

  return { perfil, admin }
}
