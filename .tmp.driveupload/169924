/**
 * SCRIPT DE MIGRAÇÃO — Google Sheets → Supabase
 * ================================================
 * Como usar:
 *  1. Exporte cada aba do Google Sheets como CSV (Arquivo → Fazer download → CSV)
 *  2. Copie os arquivos para a pasta  scripts/dados/  com estes nomes exatos:
 *       produtos.csv   → aba de produtos
 *       modelos.csv    → aba de modelos
 *       cores.csv      → aba de cores
 *       marcas.csv     → aba de marcas
 *       clientes.csv   → aba de clientes
 *  3. Coloque a chave de serviço do Supabase no arquivo .env:
 *       SUPABASE_SERVICE_KEY=eyJhbGci...  (Supabase → Project Settings → API → service_role)
 *  4. Execute:  node scripts/importar.mjs
 *
 * ESTRUTURA ESPERADA DOS CSVs:
 *  produtos / modelos / cores / marcas:
 *    Coluna A = nome do item  (com ou sem cabeçalho)
 *
 *  clientes:
 *    Coluna A = celular/whatsapp
 *    Coluna B = instagram (nome do cliente)
 *    Coluna C = data de cadastro  (DD/MM/AAAA ou AAAA-MM-DD)
 *    Coluna D = bloqueado         (TRUE/FALSE ou VERDADEIRO/FALSO)
 *    Coluna E = mensagem de bloqueio
 */

import { createClient }    from '@supabase/supabase-js'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname }   from 'path'
import { fileURLToPath }   from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Carrega variáveis do .env ────────────────────────────────
function loadEnv() {
  const envPath = join(__dirname, '..', '.env')
  if (!existsSync(envPath)) {
    console.error('❌  Arquivo .env não encontrado em', envPath)
    process.exit(1)
  }
  const env = {}
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const idx = line.indexOf('=')
    if (idx > 0) {
      const key = line.slice(0, idx).trim()
      const val = line.slice(idx + 1).trim()
      if (key) env[key] = val
    }
  })
  return env
}

const env = loadEnv()
const SUPABASE_URL  = env.VITE_SUPABASE_URL
const SERVICE_KEY   = env.SUPABASE_SERVICE_KEY   // chave de serviço (bypassa RLS)
const ANON_KEY      = env.VITE_SUPABASE_ANON_KEY
const TENANT_ID     = env.VITE_TENANT_ID

if (!SUPABASE_URL || !TENANT_ID) {
  console.error('❌  Variáveis VITE_SUPABASE_URL e VITE_TENANT_ID precisam estar no .env')
  process.exit(1)
}
if (!SERVICE_KEY && !ANON_KEY) {
  console.error('❌  Nenhuma chave Supabase encontrada no .env')
  process.exit(1)
}

// Prefere service_role (bypassa RLS); avisa se usar anon
const CHAVE_USADA = SERVICE_KEY || ANON_KEY
if (!SERVICE_KEY) {
  console.warn('⚠️   SUPABASE_SERVICE_KEY não encontrada — usando chave anon.')
  console.warn('     Se der erro de permissão, adicione a service_role key no .env.\n')
}

const supabase = createClient(SUPABASE_URL, CHAVE_USADA, {
  auth: { persistSession: false },
})

const DADOS_DIR = join(__dirname, 'dados')
if (!existsSync(DADOS_DIR)) mkdirSync(DADOS_DIR, { recursive: true })

// ── Parser CSV simples (suporta aspas) ────────────────────────
function parseCSV(content) {
  const linhas = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  return linhas.map(linha => {
    const cols = []
    let cel = '', inQ = false
    for (const c of linha) {
      if (c === '"') { inQ = !inQ }
      else if (c === ',' && !inQ) { cols.push(cel.trim()); cel = '' }
      else { cel += c }
    }
    cols.push(cel.trim())
    return cols
  }).filter(row => row.some(c => c !== ''))
}

// ── Detecta se a primeira linha é cabeçalho ───────────────────
const PALAVRAS_HEADER = [
  'produto','modelo','cor','marca','nome','cliente','instagram',
  'celular','whatsapp','data','bloqueado','status','item',
]
function isHeader(linha) {
  return linha.slice(0, 3).some(c =>
    PALAVRAS_HEADER.includes(c.toLowerCase().replace(/[^a-z]/g, ''))
  )
}

// ── Nomes de mês (PT e EN) ────────────────────────────────────
const MESES = {
  jan:1, fev:2, mar:3, abr:4, mai:5, jun:6,
  jul:7, ago:8, set:9, out:10, nov:11, dez:12,
  jan_:1, feb:2, apr:4, may:5, aug:8, sep:9, oct:10, nov_:11, dec:12,
}

// ── Converte vários formatos de data → ISO (AAAA-MM-DD) ───────
function parsearData(str) {
  if (!str) return null
  str = str.toString().trim()

  // AAAA-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str

  // DD/MM/AAAA  ou  D/M/AAAA
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/')
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }

  // DD/MMM/AAAA  (ex: 10/Dez/2025)
  const mNome = str.match(/^(\d{1,2})\/([A-Za-zç]{3,})\/(\d{4})$/)
  if (mNome) {
    const [, d, mesStr, y] = mNome
    const m = MESES[mesStr.toLowerCase().slice(0, 3)]
    if (m) return `${y}-${String(m).padStart(2,'0')}-${d.padStart(2,'0')}`
  }

  // DD-MM-AAAA
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [d, m, y] = str.split('-')
    return `${y}-${m}-${d}`
  }

  return null
}

// ── Converte preço BR (1.234,56 ou 99,90 ou 99.90) → float ───
function parsearPreco(str) {
  if (!str && str !== 0) return null
  str = str.toString().trim().replace(/R\$\s*/i, '').replace(/\s/g, '')
  if (!str) return null
  // Formato BR: pontos como milhar, vírgula como decimal
  if (/^[\d.]+,\d{1,2}$/.test(str))
    return parseFloat(str.replace(/\./g, '').replace(',', '.'))
  // Vírgula como decimal sem milhar
  if (/^\d+,\d{1,2}$/.test(str))
    return parseFloat(str.replace(',', '.'))
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}

// ── Insere em lotes com upsert (ignora duplicatas) ────────────
// onConflict: coluna(s) usadas como chave única, ex: 'tenant_id,nome'
async function inserirEmLotes(tabela, registros, onConflict, loteSize = 100) {
  let total = 0, erros = 0
  for (let i = 0; i < registros.length; i += loteSize) {
    const lote = registros.slice(i, i + loteSize)
    const { error } = await supabase
      .from(tabela)
      .upsert(lote, { onConflict, ignoreDuplicates: true })
    if (error) {
      console.error(`\n   ❌  Erro no lote ${Math.floor(i/loteSize)+1}: ${error.message}`)
      erros += lote.length
    } else {
      total += lote.length
      process.stdout.write(`\r   Inserindo... ${Math.min(i + loteSize, registros.length)}/${registros.length}`)
    }
  }
  if (registros.length > 0) process.stdout.write('\n')
  return { total, erros }
}

// ── Importar lista simples (1 coluna de nomes) ─────────────────
async function importarLista(arquivo, tabela) {
  const caminho = join(DADOS_DIR, arquivo)
  if (!existsSync(caminho)) {
    console.log(`   ⚠️   ${arquivo} não encontrado — pulando`)
    return
  }

  console.log(`\n📥  ${arquivo}  →  ${tabela}`)
  const linhas = parseCSV(readFileSync(caminho, 'utf8'))
  const dados  = (isHeader(linhas[0] || []) ? linhas.slice(1) : linhas)
    .map(row => (row[0] || '').toString().trim())
    .filter(nome => nome.length > 0)

  if (!dados.length) { console.log('   ⚠️   Nenhum dado válido'); return }

  // Deduplica o próprio CSV (case-insensitive) antes de qualquer coisa
  const vistos = new Set()
  const dadosUnicos = dados.filter(nome => {
    const k = nome.toLowerCase()
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
  const duplicasCSV = dados.length - dadosUnicos.length
  console.log(`   ${dadosUnicos.length} itens únicos no CSV${duplicasCSV ? ` (${duplicasCSV} duplicatas removidas)` : ''}`)

  const registros = dadosUnicos.map(nome => ({ tenant_id: TENANT_ID, nome }))

  // upsert com ignoreDuplicates=true — itens já existentes são pulados silenciosamente
  const { total, erros } = await inserirEmLotes(tabela, registros, 'tenant_id,nome')
  console.log(`   ✅  Processados ${registros.length} itens${erros ? ` | ❌ ${erros} com erro real` : ''}`)
}

// ── Importar clientes ──────────────────────────────────────────
async function importarClientes() {
  const caminho = join(DADOS_DIR, 'clientes.csv')
  if (!existsSync(caminho)) {
    console.log(`   ⚠️   clientes.csv não encontrado — pulando`)
    return
  }

  console.log(`\n📥  clientes.csv  →  clientes`)
  const linhas = parseCSV(readFileSync(caminho, 'utf8'))
  const dados  = isHeader(linhas[0] || []) ? linhas.slice(1) : linhas

  const hoje = new Date().toISOString().slice(0, 10) // fallback se a data estiver vazia

  // Mapeamento: col A=whatsapp, col B=instagram, col C=data, col D=bloqueado, col E=msg
  const clientes = dados
    .map(row => ({
      whatsapp:      (row[0] || '').toString().trim().replace(/\D/g, ''),
      instagram:     (row[1] || '').toString().trim(),
      // Usa a data do CSV; se estiver vazia, usa a data de hoje (evita erro NOT NULL)
      data_cadastro: parsearData(row[2]) || hoje,
      bloqueado:     ['true','verdadeiro','1','sim'].includes((row[3]||'').toLowerCase()),
      msg_bloqueio:  (row[4] || '').toString().trim(),
    }))
    .filter(c => c.instagram.length > 0)

  if (!clientes.length) { console.log('   ⚠️   Nenhum cliente válido'); return }

  // Deduplica por instagram (case-insensitive)
  const vistos = new Set()
  const clientesUnicos = clientes.filter(c => {
    const k = c.instagram.toLowerCase()
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
  const duplicasCSV = clientes.length - clientesUnicos.length
  console.log(`   ${clientesUnicos.length} clientes únicos no CSV${duplicasCSV ? ` (${duplicasCSV} duplicatas removidas)` : ''}`)

  const registros = clientesUnicos.map(c => ({ tenant_id: TENANT_ID, ...c }))

  // upsert — clientes já existentes são pulados silenciosamente
  const { total, erros } = await inserirEmLotes('clientes', registros, 'tenant_id,instagram')
  console.log(`   ✅  Processados ${registros.length} clientes${erros ? ` | ❌ ${erros} com erro real` : ''}`)
}

// ── Importar vendas históricas ─────────────────────────────────
// Estrutura esperada do CSV (colunas):
//  A=Produto B=Modelo C=Cor D=Marca E=Tamanho F=Preço G=Cód
//  H=Cliente I=Data J=Live K=Sacola L=Status
//  M-Q=ignorados (Pedido/Obs/DataEnvio/Msg/Rastreio)
//  R=fila1 S=fila2 T=fila3
async function importarVendas() {
  const caminho = join(DADOS_DIR, 'vendas.csv')
  if (!existsSync(caminho)) {
    console.log(`   ⚠️   vendas.csv não encontrado — pulando`)
    return
  }

  console.log(`\n📥  vendas.csv  →  vendas`)

  // Avisa se já há vendas enviadas no banco (evitar importar duas vezes)
  const { count: jaExistentes } = await supabase
    .from('vendas').select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID).eq('status', 'ENVIADO')

  if (jaExistentes && jaExistentes > 0) {
    console.log(`\n   ⚠️   ATENÇÃO: já existem ${jaExistentes} vendas enviadas no banco!`)
    console.log(`   ⚠️   Rodar esta importação novamente vai DUPLICAR os registros.`)
    console.log(`   ⚠️   Pressione Ctrl+C para cancelar. Continuando em 8 segundos...\n`)
    await new Promise(r => setTimeout(r, 8000))
  }

  const linhas = parseCSV(readFileSync(caminho, 'utf8'))
  const dados  = isHeader(linhas[0] || []) ? linhas.slice(1) : linhas

  let semCliente = 0
  const vendas = dados
    .map(row => {
      const cliente = (row[7] || '').toString().trim()
      if (!cliente) { semCliente++; return null }

      const statusRaw  = (row[11] || '').toString().trim().toLowerCase()
      const sacolinha  = parseInt(row[10]) || null
      const dataLive   = parsearData(row[8])

      // Mapeamento de status da planilha → campos do Supabase
      // "Enviado Lote"  → status=ENVIADO, tipo_envio=lote
      // "Enviado Indiv" → status=ENVIADO, tipo_envio=individual
      // "Separado"      → status=SEPARADO (mantém para uso futuro)
      // outros          → preserva o valor original
      let status, tipoEnvio
      if (statusRaw.includes('indiv')) {
        status = 'ENVIADO'; tipoEnvio = 'individual'
      } else if (statusRaw.includes('enviado') || statusRaw.includes('lote')) {
        status = 'ENVIADO'; tipoEnvio = 'lote'
      } else if (statusRaw.includes('separado')) {
        status = 'SEPARADO'; tipoEnvio = ''
      } else {
        status = (row[11] || '').toString().trim().toUpperCase(); tipoEnvio = ''
      }

      return {
        tenant_id:    TENANT_ID,
        produto:      (row[0]  || '').toString().trim(),
        modelo:       (row[1]  || '').toString().trim(),
        cor:          (row[2]  || '').toString().trim(),
        marca:        (row[3]  || '').toString().trim(),
        tamanho:      (row[4]  || '').toString().trim(),
        preco:        parsearPreco(row[5]),
        codigo:       (row[6]  || '').toString().trim(),
        cliente_nome: cliente,
        data_live:    dataLive,
        live_nome:    (row[9]  || '').toString().trim(),
        sacolinha,
        status,
        tipo_envio:   tipoEnvio,
        // Colunas extras (M-Q) — preservadas para uso futuro
        pedido:       (row[12] || '').toString().trim(),
        observacao:   (row[13] || '').toString().trim(),
        data_envio:   parsearData(row[14]) || null,
        msg_lidas:    (row[15] || '').toString().trim(),
        rastreio:     (row[16] || '').toString().trim(),
        fila1:        (row[17] || '').toString().trim(),
        fila2:        (row[18] || '').toString().trim(),
        fila3:        (row[19] || '').toString().trim(),
      }
    })
    .filter(Boolean)

  console.log(`   ${vendas.length} vendas com cliente | ${semCliente} linhas sem cliente (ignoradas)`)

  if (!vendas.length) { console.log('   ⚠️   Nenhuma venda válida'); return }

  // INSERT simples — vendas não têm chave única natural
  let total = 0, erros = 0
  const LOTE = 200
  for (let i = 0; i < vendas.length; i += LOTE) {
    const lote = vendas.slice(i, i + LOTE)
    const { error } = await supabase.from('vendas').insert(lote)
    if (error) {
      console.error(`\n   ❌  Lote ${Math.floor(i/LOTE)+1}: ${error.message}`)
      erros += lote.length
    } else {
      total += lote.length
      process.stdout.write(`\r   Inserindo... ${Math.min(i + LOTE, vendas.length)}/${vendas.length}`)
    }
  }
  process.stdout.write('\n')
  console.log(`   ✅  ${total} vendas inseridas${erros ? ` | ❌ ${erros} com erro` : ''}`)
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║   Migração Google Sheets → Supabase      ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log(`   Tenant: ${TENANT_ID}`)
  console.log(`   URL:    ${SUPABASE_URL}\n`)

  await importarLista('produtos.csv', 'listas_produtos')
  await importarLista('modelos.csv',  'listas_modelos')
  await importarLista('cores.csv',    'listas_cores')
  await importarLista('marcas.csv',   'listas_marcas')
  await importarClientes()
  await importarVendas()

  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║   ✅  Migração concluída!                 ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log('\n⚠️  Lembre-se de remover o SUPABASE_SERVICE_KEY do .env após terminar.\n')
}

main().catch(err => {
  console.error('\n❌  Erro fatal:', err.message || err)
  process.exit(1)
})
