#!/usr/bin/env node
/**
 * Script para corrigir a policy de notificações no Supabase
 * Execute com: node scripts/apply-notificacoes-fix.mjs
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Carrega .env
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_SERVICE_ROLE_KEY não encontradas')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
})

async function main() {
  console.log('🔧 Corrigindo policies de notificações...\n')

  // Lê o arquivo SQL
  const sqlPath = join(__dirname, '..', 'sql', 'fix_notificacoes_destinatario_policy.sql')
  const sqlContent = readFileSync(sqlPath, 'utf-8')

  // Remove comentários e divide em statements
  const statements = sqlContent
    .split('\n')
    .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
    .join('\n')
    .split(';')
    .filter(stmt => stmt.trim() !== '')

  console.log(`📝 Encontrados ${statements.length} comandos SQL para executar\n`)

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i].trim()
    if (!statement) continue

    // Identifica o tipo de comando
    const comando = statement.split(' ')[0].toUpperCase()
    console.log(`${i + 1}/${statements.length} Executando ${comando}...`)

    try {
      // Executa via REST API do Supabase usando from() + rpc() não funciona para DDL
      // Vamos tentar via REST direto
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ query: statement + ';' })
      })

      if (!response.ok) {
        // Se não existe a função exec_sql, vamos tentar outro método
        console.warn('⚠️  Método exec_sql não disponível, tentando método alternativo...')

        // Tenta criar uma edge function temporária (isso não vai funcionar aqui)
        // A solução é executar manualmente no SQL Editor do Supabase
        throw new Error('Não é possível executar DDL via API. Execute manualmente no SQL Editor do Supabase.')
      }

      console.log('✅ Sucesso\n')
    } catch (error) {
      console.error(`❌ Erro: ${error.message}\n`)

      console.log('\n' + '═'.repeat(70))
      console.log('📋 INSTRUÇÕES MANUAIS')
      console.log('═'.repeat(70))
      console.log('\nComo o Supabase não permite executar DDL via API,')
      console.log('execute os comandos SQL manualmente:')
      console.log('\n1. Acesse: https://supabase.com/dashboard/project/gtsdgkalolqzjmmwtvdv/sql')
      console.log('\n2. Copie e cole o conteúdo do arquivo:')
      console.log('   sql/fix_notificacoes_destinatario_policy.sql')
      console.log('\n3. Clique em "Run" para executar')
      console.log('\n' + '═'.repeat(70) + '\n')

      // Mostra o SQL para facilitar
      console.log('SQL a ser executado:')
      console.log('─'.repeat(70))
      console.log(sqlContent)
      console.log('─'.repeat(70))

      process.exit(1)
    }
  }

  console.log('🎉 Todas as policies foram corrigidas com sucesso!')
  console.log('\nAgora notificações com destinatário "TODOS" aparecerão')
  console.log('para todos os usuários da empresa EA Second Hand.\n')
}

main().catch(err => {
  console.error('❌ Erro fatal:', err.message)
  process.exit(1)
})
