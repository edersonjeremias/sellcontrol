/**
 * Script para corrigir a policy de notificações
 * Permite que usuários vejam notificações destinadas a "TODOS" ou ao seu nome
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não encontradas')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function executarSQL(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

  if (error) {
    console.error('❌ Erro ao executar SQL:', error.message)
    throw error
  }

  return data
}

async function main() {
  console.log('🔧 Iniciando correção das policies de notificações...\n')

  try {
    // Remove policy antiga de SELECT
    console.log('1️⃣ Removendo policy antiga de SELECT...')
    await executarSQL(`
      DROP POLICY IF EXISTS "usuarios_veem_proprias_notificacoes" ON notificacoes;
    `)
    console.log('✅ Policy antiga removida\n')

    // Cria nova policy de SELECT
    console.log('2️⃣ Criando nova policy de SELECT considerando destinatário...')
    await executarSQL(`
      CREATE POLICY "usuarios_veem_notificacoes_destinatario"
        ON notificacoes FOR SELECT
        USING (
          tenant_id IN (
            SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
          )
          AND (
            user_id = auth.uid()
            OR user_id IS NULL
            OR destinatario = 'TODOS'
            OR destinatario = (
              SELECT nome FROM users_perfil WHERE id = auth.uid()
            )
          )
        );
    `)
    console.log('✅ Nova policy de SELECT criada\n')

    // Remove policy antiga de UPDATE
    console.log('3️⃣ Removendo policy antiga de UPDATE...')
    await executarSQL(`
      DROP POLICY IF EXISTS "usuarios_atualizam_proprias_notificacoes" ON notificacoes;
    `)
    console.log('✅ Policy antiga de UPDATE removida\n')

    // Cria nova policy de UPDATE
    console.log('4️⃣ Criando nova policy de UPDATE considerando destinatário...')
    await executarSQL(`
      CREATE POLICY "usuarios_atualizam_notificacoes_destinatario"
        ON notificacoes FOR UPDATE
        USING (
          tenant_id IN (
            SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
          )
          AND (
            user_id = auth.uid()
            OR user_id IS NULL
            OR destinatario = 'TODOS'
            OR destinatario = (
              SELECT nome FROM users_perfil WHERE id = auth.uid()
            )
          )
        );
    `)
    console.log('✅ Nova policy de UPDATE criada\n')

    console.log('🎉 Policies corrigidas com sucesso!')
    console.log('\nAgora notificações com destinatário "TODOS" serão visíveis para todos os usuários da empresa.')
  } catch (err) {
    console.error('\n❌ Erro durante a execução:', err.message)
    process.exit(1)
  }
}

main()
