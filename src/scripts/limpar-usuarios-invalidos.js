/**
 * Script para limpar usuários inválidos do sistema
 * Remove usuários que:
 * 1. São clientes do portal (estão em portal_clientes)
 * 2. Têm role 'master' mas não são o Ederson Jeremias
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Carrega .env do diretório raiz
dotenv.config({ path: join(__dirname, '..', '.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Variáveis de ambiente não encontradas!')
  console.error('   VITE_SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SERVICE_KEY ? '✓' : '✗')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ID do tenant EA Second Hand
const TENANT_EA = '7135c82e-6155-41e5-9c42-638a94226bc9'

// Email do Ederson (único master legítimo)
const EMAIL_EDERSON = 'edersonjeremias@gmail.com'

async function limparUsuariosInvalidos() {
  console.log('🔍 Buscando usuários inválidos...\n')

  // 1. Busca todos os user_ids que estão no portal_clientes
  const { data: clientesPortal, error: errorPortal } = await supabase
    .from('portal_clientes')
    .select('user_id, instagram, nome_completo')

  if (errorPortal) {
    console.error('❌ Erro ao buscar clientes do portal:', errorPortal)
    return
  }

  const idsClientesPortal = (clientesPortal || []).map(c => c.user_id).filter(Boolean)

  console.log('📋 Clientes do portal encontrados:', clientesPortal?.length || 0)
  clientesPortal?.forEach(c => {
    console.log(`   - ${c.nome_completo || c.instagram} (${c.user_id})`)
  })

  // 2. Busca todos os usuários do tenant EA
  const { data: usuarios, error: errorUsuarios } = await supabase
    .from('users_perfil')
    .select('id, nome, email, username, role')
    .eq('tenant_id', TENANT_EA)

  if (errorUsuarios) {
    console.error('❌ Erro ao buscar usuários:', errorUsuarios)
    return
  }

  console.log('\n👥 Usuários encontrados no tenant EA:', usuarios?.length || 0)

  const usuariosParaRemover = []

  usuarios?.forEach(u => {
    let motivo = null

    // É cliente do portal?
    if (idsClientesPortal.includes(u.id)) {
      motivo = 'Cliente do portal (não deve estar em users_perfil)'
    }
    // É master mas não é o Ederson?
    else if (u.role === 'master' && u.email !== EMAIL_EDERSON) {
      motivo = 'Role master inválido (apenas Ederson pode ser master)'
    }

    if (motivo) {
      usuariosParaRemover.push({ ...u, motivo })
      console.log(`\n   ⚠️  ${u.nome || u.email}`)
      console.log(`       Email: ${u.email}`)
      console.log(`       Role: ${u.role}`)
      console.log(`       Motivo: ${motivo}`)
    }
  })

  if (usuariosParaRemover.length === 0) {
    console.log('\n✅ Nenhum usuário inválido encontrado!')
    return
  }

  console.log(`\n\n🗑️  ${usuariosParaRemover.length} usuário(s) serão removidos:\n`)

  // Remove os usuários inválidos
  for (const u of usuariosParaRemover) {
    console.log(`   Removendo: ${u.nome || u.email} (${u.motivo})`)

    // Remove da tabela users_perfil
    const { error: deleteError } = await supabase
      .from('users_perfil')
      .delete()
      .eq('id', u.id)

    if (deleteError) {
      console.log(`   ❌ Erro ao remover: ${deleteError.message}`)
    } else {
      console.log(`   ✅ Removido com sucesso`)
    }
  }

  console.log('\n✨ Limpeza concluída!')
  console.log('\n📊 Resumo:')
  console.log(`   - Usuários analisados: ${usuarios?.length || 0}`)
  console.log(`   - Usuários removidos: ${usuariosParaRemover.length}`)
  console.log(`   - Clientes do portal: ${clientesPortal?.length || 0}`)
}

limparUsuariosInvalidos()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Erro fatal:', err)
    process.exit(1)
  })
