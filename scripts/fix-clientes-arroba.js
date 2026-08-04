/**
 * Script para remover @ dos nomes de clientes duplicados
 * Remove o @ dos clientes e vendas criados na importação
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Carregar variáveis de ambiente
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
const tenantId = process.env.VITE_TENANT_ID

if (!supabaseUrl || !supabaseServiceKey || !tenantId) {
  console.error('❌ Erro: Variáveis de ambiente não encontradas')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

async function main() {
  console.log('🔧 Corrigindo nomes de clientes com @...\n')

  // 1. Buscar todos os clientes com @ no instagram
  const { data: clientesComArroba, error: errorClientes } = await supabase
    .from('clientes')
    .select('id, instagram')
    .eq('tenant_id', tenantId)
    .like('instagram', '@%')

  if (errorClientes) {
    console.error('❌ Erro ao buscar clientes:', errorClientes.message)
    process.exit(1)
  }

  console.log(`📊 Encontrados ${clientesComArroba.length} clientes com @\n`)

  // 2. Para cada cliente com @, atualizar vendas e depois o cliente
  for (const cliente of clientesComArroba) {
    const instagramComArroba = cliente.instagram
    const instagramSemArroba = instagramComArroba.substring(1) // Remove @

    console.log(`🔄 Processando: ${instagramComArroba} → ${instagramSemArroba}`)

    // 2.1. Atualizar vendas que usam este cliente
    const { error: errorVendas } = await supabase
      .from('vendas')
      .update({ cliente_nome: instagramSemArroba })
      .eq('tenant_id', tenantId)
      .eq('cliente_nome', instagramComArroba)

    if (errorVendas) {
      console.error(`   ❌ Erro ao atualizar vendas: ${errorVendas.message}`)
      continue
    }

    // 2.2. Verificar se já existe cliente sem @
    const { data: clienteExistente } = await supabase
      .from('clientes')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('instagram', instagramSemArroba)
      .single()

    if (clienteExistente) {
      // Cliente sem @ já existe, então:
      // - Atualizar vendas para apontar pro cliente correto
      // - Deletar o cliente duplicado (com @)

      console.log(`   ✅ Cliente sem @ já existe, mesclando...`)

      const { error: errorUpdateVendas } = await supabase
        .from('vendas')
        .update({ cliente_id: clienteExistente.id })
        .eq('tenant_id', tenantId)
        .eq('cliente_id', cliente.id)

      if (errorUpdateVendas) {
        console.error(`   ❌ Erro ao mesclar vendas: ${errorUpdateVendas.message}`)
        continue
      }

      // Deletar cliente duplicado
      const { error: errorDelete } = await supabase
        .from('clientes')
        .delete()
        .eq('id', cliente.id)

      if (errorDelete) {
        console.error(`   ❌ Erro ao deletar duplicata: ${errorDelete.message}`)
      } else {
        console.log(`   🗑️  Duplicata removida`)
      }
    } else {
      // Cliente sem @ não existe, apenas renomear
      const { error: errorUpdate } = await supabase
        .from('clientes')
        .update({ instagram: instagramSemArroba })
        .eq('id', cliente.id)

      if (errorUpdate) {
        console.error(`   ❌ Erro ao renomear: ${errorUpdate.message}`)
      } else {
        console.log(`   ✅ Renomeado`)
      }
    }
  }

  console.log('\n✅ Correção concluída!')
}

main().catch(console.error)
