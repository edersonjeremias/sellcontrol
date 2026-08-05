/**
 * API para limpar usuários inválidos
 * Remove usuários que não deveriam estar no sistema
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ID do tenant EA Second Hand
const TENANT_EA = '7135c82e-6155-41e5-9c42-638a94226bc9'

// Email do Ederson (único master legítimo)
const EMAIL_EDERSON = 'edersonjeremias@gmail.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  try {
    const log = []
    log.push('🔍 Buscando usuários inválidos...')

    // 1. Busca todos os user_ids que estão no portal_clientes
    const { data: clientesPortal } = await supabase
      .from('portal_clientes')
      .select('user_id, instagram, nome_completo')

    const idsClientesPortal = (clientesPortal || []).map(c => c.user_id).filter(Boolean)

    log.push(`📋 Clientes do portal: ${clientesPortal?.length || 0}`)

    // 2. Busca todos os usuários do tenant EA
    const { data: usuarios } = await supabase
      .from('users_perfil')
      .select('id, nome, email, username, role')
      .eq('tenant_id', TENANT_EA)

    log.push(`👥 Usuários no tenant EA: ${usuarios?.length || 0}`)

    const usuariosRemovidos = []

    // 3. Remove usuários inválidos
    for (const u of usuarios || []) {
      let motivo = null

      // É cliente do portal?
      if (idsClientesPortal.includes(u.id)) {
        motivo = 'Cliente do portal'
      }
      // É master mas não é o Ederson?
      else if (u.role === 'master' && u.email !== EMAIL_EDERSON) {
        motivo = 'Master inválido'
      }

      if (motivo) {
        // Remove da users_perfil
        const { error: deleteError } = await supabase
          .from('users_perfil')
          .delete()
          .eq('id', u.id)

        if (!deleteError) {
          usuariosRemovidos.push({
            nome: u.nome || u.email,
            email: u.email,
            role: u.role,
            motivo
          })
          log.push(`   ✅ Removido: ${u.nome || u.email} (${motivo})`)
        } else {
          log.push(`   ❌ Erro ao remover ${u.nome}: ${deleteError.message}`)
        }
      }
    }

    log.push(`✨ Limpeza concluída: ${usuariosRemovidos.length} removidos`)

    return res.status(200).json({
      success: true,
      removidos: usuariosRemovidos.length,
      detalhes: usuariosRemovidos,
      log
    })

  } catch (error) {
    console.error('Erro ao limpar usuários:', error)
    return res.status(500).json({
      error: 'Erro ao limpar usuários',
      message: error.message
    })
  }
}
