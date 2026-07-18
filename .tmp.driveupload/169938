# 🔄 Sincronização Google Sheets → Supabase

Sincroniza automaticamente os dados da sua planilha do Google Sheets para a tabela `clientes` no Supabase.

## 📋 Pré-requisitos

### 1. Tornar a planilha pública (OU obter API Key)

**OPÇÃO A - Tornar pública (Mais Simples):**
1. Abra sua planilha: https://docs.google.com/spreadsheets/d/1Mqklox3RL4CrC_z0xfOTUntKZ0786X6ypsK_Co-fes
2. Clique em **"Compartilhar"** (canto superior direito)
3. Clique em **"Alterar para qualquer pessoa com o link"**
4. Definir permissão como **"Leitor"**
5. Pronto! O script vai conseguir ler os dados

**OPÇÃO B - Usar API Key do Google:**
1. Acesse: https://console.cloud.google.com/apis/credentials
2. Clique em **"Criar credenciais"** → **"Chave de API"**
3. Copie a chave gerada
4. Habilite a Google Sheets API: https://console.cloud.google.com/apis/library/sheets.googleapis.com
5. Adicione a chave no arquivo `.env`:
   ```bash
   GOOGLE_SHEETS_API_KEY=sua_chave_aqui
   ```

### 2. Verificar configuração do .env

Abra o arquivo `scripts/.env` e verifique se tem:

```bash
VITE_SUPABASE_URL=https://gtsdgkalolqzjmmwtvdv.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
GOOGLE_SHEETS_API_KEY=AIza...  # Adicione esta linha
```

## 🚀 Como Usar

### Executar sincronização única:

```bash
cd scripts
node sync-sheets-to-supabase.js
```

### Executar automaticamente a cada X minutos:

**Windows (PowerShell):**
```powershell
# A cada 5 minutos
while ($true) {
  node sync-sheets-to-supabase.js
  Start-Sleep -Seconds 300
}
```

**Linux/Mac:**
```bash
# A cada 5 minutos
watch -n 300 node sync-sheets-to-supabase.js
```

## 📊 Mapeamento de Colunas

| Google Sheets (Coluna) | Supabase (Campo)  | Tipo      |
|------------------------|-------------------|-----------|
| A - Whatsapp          | whatsapp          | TEXT      |
| B - Cliente           | instagram         | TEXT      |
| C - Data cadastro     | data_cadastro     | DATE      |
| D - Bloqueado         | bloqueado         | BOOLEAN   |
| E - Observações       | msg_bloqueio      | TEXT      |
| F - Senha             | (não importado)   | -         |
| G - Nome completo     | (não importado)   | -         |
| H - cpf               | (não importado)   | -         |

> **Nota:** Nome completo, CPF e Senha estão na planilha mas NÃO são importados para a tabela `clientes` porque esses campos não existem nela. Se precisar importar esses dados, preciso criar essas colunas no Supabase.

## 🎯 O que o script faz:

✅ Lê todos os dados da planilha  
✅ Para cada linha:
  - Se o cliente **já existe** (busca por instagram): **ATUALIZA**
  - Se o cliente **não existe**: **INSERE**
✅ Ignora linhas sem instagram  
✅ Mostra progresso em tempo real  
✅ Exibe resumo ao final (inseridos, atualizados, pulados, erros)

## ⚙️ Configurações Avançadas

### Mudar a planilha:

Edite `sync-sheets-to-supabase.js` linha 8:
```javascript
const SPREADSHEET_ID = 'NOVA_ID_AQUI'
```

### Mudar a aba/range:

Edite `sync-sheets-to-supabase.js` linha 9:
```javascript
const RANGE = 'NOME_DA_ABA!A2:I'
```

### Mudar o tenant:

Edite `sync-sheets-to-supabase.js` linha 10:
```javascript
const TENANT_ID = 'NOVO_TENANT_ID'
```

## ❓ Problemas Comuns

### "Error: The caller does not have permission"
- Torne a planilha pública (Opção A)
- OU configure a API Key corretamente (Opção B)

### "Error: Unable to parse range"
- Verifique se o nome da aba está correto (`cliente`)
- Verifique se o range está correto (`A2:I`)

### "Error: No data found"
- Verifique se há dados na planilha
- Verifique se a aba `cliente` existe

## 🔒 Segurança

- ✅ A planilha pode ser pública porque não contém dados sensíveis críticos
- ✅ O script usa ANON_KEY do Supabase (seguro para frontend)
- ⚠️ Não commite o arquivo `.env` no Git (já está no .gitignore)
- ⚠️ Senhas da planilha NÃO são importadas

## 📞 Suporte

Se tiver problemas, me avise com:
1. A mensagem de erro completa
2. O que você estava tentando fazer
3. Print da configuração (sem mostrar chaves secretas!)
