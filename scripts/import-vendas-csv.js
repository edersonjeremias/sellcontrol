/**
 * Script para importar vendas do CSV (sistema antigo) para o Supabase
 *
 * Uso: node scripts/import-vendas-csv.js "caminho/para/arquivo.csv"
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
  console.error('supabaseUrl:', supabaseUrl)
  console.error('supabaseServiceKey:', supabaseServiceKey ? 'OK' : 'FALTANDO')
  console.error('tenantId:', tenantId)
  process.exit(1)
}

// Usar service_role_key para bypass do RLS
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

/**
 * Parse CSV simples (lida com vírgulas dentro de aspas)
 */
function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim())
  const headers = lines[0].split(',').map(h => h.trim())

  return lines.slice(1).map(line => {
    const values = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())

    const row = {}
    headers.forEach((header, i) => {
      row[header] = values[i] || ''
    })
    return row
  })
}

/**
 * Corrige encoding UTF-8
 */
function fixEncoding(text) {
  const replacements = {
    'CalÃ§a': 'Calça',
    'LenÃ§ol': 'Lençol',
    'LeÃ£o': 'Leão',
    'colchÃ£o': 'colchão',
    'JogÃª': 'Jogê',
  }

  let result = text
  for (const [wrong, right] of Object.entries(replacements)) {
    result = result.replace(new RegExp(wrong, 'g'), right)
  }
  return result
}

/**
 * Normaliza nome do cliente (remove @ se tiver)
 */
function normalizeCliente(nome) {
  nome = fixEncoding(nome.trim())
  return nome.replace(/^@/, '') // Remove @ se existir
}

/**
 * Busca ou cria cliente no banco
 */
async function getOrCreateCliente(instagram) {
  // Buscar cliente existente
  const { data: existing } = await supabase
    .from('clientes')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('instagram', instagram)
    .single()

  if (existing) {
    return existing.id
  }

  // Criar novo cliente
  const { data: newCliente, error } = await supabase
    .from('clientes')
    .insert({
      tenant_id: tenantId,
      instagram,
      whatsapp: '',
      data_cadastro: new Date().toISOString().split('T')[0]
    })
    .select('id')
    .single()

  if (error) {
    console.error(`❌ Erro ao criar cliente ${instagram}:`, error.message)
    return null
  }

  return newCliente.id
}

/**
 * Busca ou cria live no banco
 */
async function getOrCreateLive(liveName) {
  // Buscar live existente
  const { data: existing } = await supabase
    .from('lives')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('nome', liveName)
    .single()

  if (existing) {
    return existing.id
  }

  // Criar nova live
  const { data: newLive, error } = await supabase
    .from('lives')
    .insert({
      tenant_id: tenantId,
      nome: liveName
    })
    .select('id')
    .single()

  if (error) {
    console.error(`❌ Erro ao criar live ${liveName}:`, error.message)
    return null
  }

  return newLive.id
}

/**
 * Main
 */
async function main() {
  const csvPath = process.argv[2]

  if (!csvPath) {
    console.error('❌ Uso: node scripts/import-vendas-csv.js "caminho/para/arquivo.csv"')
    process.exit(1)
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Arquivo não encontrado: ${csvPath}`)
    process.exit(1)
  }

  console.log(`📂 Lendo arquivo: ${csvPath}`)
  const content = fs.readFileSync(csvPath, 'utf-8')
  const rows = parseCSV(content)

  console.log(`📊 Total de vendas no CSV: ${rows.length}`)
  console.log('')

  // Processar vendas
  let success = 0
  let errors = 0
  const clientesCache = new Map()

  // Determinar nome da live (pega do primeiro registro ou usa padrão)
  const liveName = rows[0]?.live_nome === '1'
    ? `Live ${rows[0]?.data_live || new Date().toISOString().split('T')[0]}`
    : rows[0]?.live_nome || 'Live Importada'

  console.log(`📺 Live: ${liveName}`)
  console.log('')

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const num = i + 1

    try {
      // Normalizar dados
      const instagram = normalizeCliente(row.cliente_nome)
      const produto = fixEncoding(row.produto)
      const modelo = fixEncoding(row.modelo)
      const cor = fixEncoding(row.cor)
      const marca = fixEncoding(row.marca)

      // Buscar/criar cliente (com cache)
      let clienteId = clientesCache.get(instagram)
      if (!clienteId) {
        clienteId = await getOrCreateCliente(instagram)
        if (clienteId) {
          clientesCache.set(instagram, clienteId)
        }
      }

      // Preparar registro de venda
      const venda = {
        tenant_id: tenantId,
        produto,
        modelo,
        cor,
        marca,
        tamanho: row.tamanho || '',
        preco: row.preco ? parseFloat(row.preco) : null,
        codigo: row.codigo || '',
        cliente_nome: instagram,
        cliente_id: clienteId,
        data_live: row.data_live || null,
        live_nome: liveName,
        sacolinha: row.sacolinha ? parseInt(row.sacolinha) : null,
        status: 'ENVIADO', // Vendas antigas já foram enviadas
        tipo_envio: 'lote'
      }

      // Inserir no banco
      const { error } = await supabase
        .from('vendas')
        .insert(venda)

      if (error) {
        console.error(`❌ Erro linha ${num}: ${error.message}`)
        errors++
      } else {
        success++
        if (success % 10 === 0) {
          console.log(`✅ Processadas: ${success}/${rows.length}`)
        }
      }

    } catch (err) {
      console.error(`❌ Erro linha ${num}:`, err.message)
      errors++
    }
  }

  console.log('')
  console.log('=' .repeat(50))
  console.log(`✅ Sucesso: ${success}`)
  console.log(`❌ Erros: ${errors}`)
  console.log(`📊 Total: ${rows.length}`)
  console.log('=' .repeat(50))
}

main().catch(console.error)
