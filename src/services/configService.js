import { supabase } from '../lib/supabase'
import { postApiInterna } from '../lib/apiInterna'

// ── Configurações do tenant ────────────────────────────────────

export async function getConfig(tenantId) {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function saveConfig(tenantId, campos) {
  const { error } = await supabase
    .from('configuracoes')
    .upsert(
      { tenant_id: tenantId, ...campos, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' }
    )
  if (error) throw error
}

// O token do Mercado Pago de cada empresa fica em configuracoes.mp_access_token
// e quem o lê são as rotas de `api/`, no servidor, sempre pelo tenant_id da
// cobrança. O getMpToken que existia aqui (com cache em memória) saiu em
// nov/2026: ninguém o chamava e ele caía no VITE_MP_ACCESS_TOKEN — o token do
// dono do sistema — quando a empresa não tinha o próprio configurado.
// Cobrança de uma empresa não pode cair na conta de outra.

// ── Usuários do tenant ─────────────────────────────────────────

export const ROLES = [
  { value: 'admin',   label: 'Admin',   desc: 'Administra a empresa (Configurações, Cupons, RH)' },
  { value: 'usuario', label: 'Usuário', desc: 'Acessa somente as páginas liberadas no botão Páginas' },
]

export async function getUsuarios(tenantId) {
  // Busca apenas clientes do portal (que têm user_id)
  const { data: clientesPortal } = await supabase
    .from('portal_clientes')
    .select('user_id')

  const idsClientesPortal = (clientesPortal || []).map(c => c.user_id).filter(Boolean)

  // Busca usuários do tenant que:
  // 1. Tenham username definido (usuários do sistema têm username)
  // 2. OU sejam admins/gerentes/vendedores/financeiro (mesmo sem username)
  // 3. E não sejam clientes do portal
  let query = supabase
    .from('users_perfil')
    .select('id, nome, email, username, role, ativo, assuntos_permitidos, created_at')
    .eq('tenant_id', tenantId)
    .or('username.neq.,role.in.(admin,gerente,vendedor,financeiro,master)')

  // Exclui clientes do portal
  if (idsClientesPortal.length > 0) {
    query = query.not('id', 'in', `(${idsClientesPortal.join(',')})`)
  }

  const { data, error } = await query.order('nome')

  if (error) throw error

  // Filtra localmente: apenas quem tem username OU role válido
  const usuariosValidos = (data || []).filter(u =>
    u.username || ['admin', 'usuario', 'master', 'gerente', 'vendedor', 'financeiro'].includes(u.role)
  )

  return usuariosValidos
}

export async function updateUsuarioRole(userId, role) {
  const { error } = await supabase
    .from('users_perfil')
    .update({ role })
    .eq('id', userId)
  if (error) throw error
}

// Atualiza dados do usuário (nome, email)
export async function updateUsuario(userId, { nome, email }) {
  const updates = {}
  if (nome !== undefined) updates.nome = nome
  if (email !== undefined) updates.email = email

  const { error } = await supabase
    .from('users_perfil')
    .update(updates)
    .eq('id', userId)

  if (error) throw error
}

// Ativa/Inativa usuário
export async function toggleUsuarioAtivo(userId, ativo) {
  const { error } = await supabase
    .from('users_perfil')
    .update({ ativo })
    .eq('id', userId)

  if (error) throw error
}

// Reseta senha do usuário (via serverless function)
//
// Caminho relativo: a serverless roda no mesmo host da aplicação, então não há
// domínio para errar nem variável para manter. Vai por postApiInterna porque a
// rota exige o token de quem está logado — ela só troca a senha de alguém da
// mesma empresa, e quem manda é quem administra.
export async function resetUsuarioSenha(userId, novaSenha) {
  return postApiInterna('/api/reset-senha-usuario', { userId, novaSenha })
}

// ── Permissões de Vendas ──────────────────────────────────────

export const VENDAS_PERMISSOES_DEFAULT = {
  pode_alterar_preco: true,
  pode_editar_preco_promocional: true,
  pode_alterar_colunas_cadastro: true,
  pode_editar_modal: true,
  pode_excluir: true,
  pode_estornar: true,
  pode_enviar: true,
  pode_cobrar: true,
  pode_copiar: true,
  pode_editar_enviadas: true,
}

// Busca permissões de vendas do usuário
export async function getVendasPermissoes(userId) {
  const { data, error } = await supabase
    .from('users_perfil')
    .select('vendas_permissoes')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data?.vendas_permissoes || VENDAS_PERMISSOES_DEFAULT
}

// Salva permissões de vendas do usuário
export async function saveVendasPermissoes(userId, permissoes) {
  const { error } = await supabase
    .from('users_perfil')
    .update({ vendas_permissoes: permissoes })
    .eq('id', userId)

  if (error) throw error
}
