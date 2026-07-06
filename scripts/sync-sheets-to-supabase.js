require('dotenv').config()
const { google } = require('googleapis')
const { createClient } = require('@supabase/supabase-js')

// Configuração
const SPREADSHEET_ID = '1Mqklox3RL4CrC_z0xfOTUntKZ0786X6ypsK_Co-fes' // Extraído da URL
const RANGE = 'cliente!A2:I' // Aba "cliente", a partir da linha 2
const TENANT_ID = 'f36f2857-8bac-4059-a9f4-84c9ab58cba0' // Seu tenant_id

// Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

// Google Sheets client
const sheets = google.sheets('v4')

// Função principal
async function syncSheetsToSupabase() {
  console.log('🚀 Iniciando sincronização Google Sheets → Supabase...\n')

  try {
    // 1. Ler dados do Google Sheets
    console.log('📊 Lendo planilha do Google Sheets...')
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
      key: process.env.GOOGLE_SHEETS_API_KEY, // API Key pública
    })

    const rows = response.data.values
    if (!rows || rows.length === 0) {
      console.log('⚠️  Nenhum dado encontrado na planilha.')
      return
    }

    console.log(`✅ ${rows.length} linhas lidas da planilha\n`)

    // 2. Processar e inserir/atualizar no Supabase
    console.log('💾 Sincronizando com Supabase...\n')

    let inserted = 0
    let updated = 0
    let skipped = 0
    let errors = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const [
        whatsapp,
        instagram,
        data_cadastro,
        bloqueado,
        observacoes,
        senha,
        nome_completo,
        cpf
      ] = row

      // Validação básica
      if (!instagram || instagram.trim() === '') {
        console.log(`⏭️  Linha ${i + 2}: Sem instagram, pulando...`)
        skipped++
        continue
      }

      // Preparar dados
      const clienteData = {
        tenant_id: TENANT_ID,
        instagram: instagram.trim().toLowerCase().replace('@', ''),
        whatsapp: whatsapp || '',
        data_cadastro: data_cadastro || new Date().toISOString().split('T')[0],
        bloqueado: bloqueado === 'TRUE' || bloqueado === 'true' || bloqueado === '☑',
        msg_bloqueio: observacoes || '',
      }

      try {
        // Verificar se já existe
        const { data: existente } = await supabase
          .from('clientes')
          .select('id')
          .eq('tenant_id', TENANT_ID)
          .eq('instagram', clienteData.instagram)
          .maybeSingle()

        if (existente) {
          // Atualizar
          const { error } = await supabase
            .from('clientes')
            .update(clienteData)
            .eq('id', existente.id)

          if (error) throw error
          console.log(`✏️  Linha ${i + 2}: @${clienteData.instagram} - ATUALIZADO`)
          updated++
        } else {
          // Inserir
          const { error } = await supabase
            .from('clientes')
            .insert(clienteData)

          if (error) throw error
          console.log(`➕ Linha ${i + 2}: @${clienteData.instagram} - INSERIDO`)
          inserted++
        }

        // Aguardar 100ms para não sobrecarregar API
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (err) {
        console.error(`❌ Linha ${i + 2}: Erro - ${err.message}`)
        errors++
      }
    }

    // 3. Resumo
    console.log('\n' + '='.repeat(50))
    console.log('📊 RESUMO DA SINCRONIZAÇÃO')
    console.log('='.repeat(50))
    console.log(`✅ Inseridos:   ${inserted}`)
    console.log(`✏️  Atualizados: ${updated}`)
    console.log(`⏭️  Pulados:     ${skipped}`)
    console.log(`❌ Erros:       ${errors}`)
    console.log('='.repeat(50))
    console.log('\n✨ Sincronização concluída!')

  } catch (error) {
    console.error('\n❌ Erro na sincronização:', error.message)
    if (error.response) {
      console.error('Detalhes:', error.response.data)
    }
    process.exit(1)
  }
}

// Executar
syncSheetsToSupabase()
