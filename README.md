# sellControl — Passo a Passo para Rodar

## 1. Instalar dependências
Abra o terminal dentro da pasta C:\sellcontrol e execute:
```
npm install
```

## 2. Configurar o banco (Supabase)
- Acesse seu projeto no Supabase
- Vá em **SQL Editor > New Query**
- Cole o conteúdo do arquivo `supabase/schema.sql` e execute
- Depois execute para criar seu tenant:
```sql
INSERT INTO tenants (nome) VALUES ('Sua Empresa') RETURNING id;
```
- Copie o UUID retornado

## 3. Configurar credenciais
- Copie o arquivo `.env.example` para `.env`
- Preencha com seus dados do Supabase:
```
VITE_SUPABASE_URL=https://SEU_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
VITE_TENANT_ID=uuid_do_tenant_criado
```

## 4. Rodar localmente
```
npm run dev
```
Acesse: http://localhost:5173

## 5. Build para produção
```
npm run build
```

## 6. Deploy no Vercel
- Acesse vercel.com e clique em "Add New Project"
- Importe a pasta do projeto ou faça via GitHub
- Adicione as variáveis de ambiente (mesmo conteúdo do .env)
- Clique em Deploy

## Estrutura do projeto
```
src/
  lib/           → Conexão com Supabase
  services/      → Funções de banco (equivalente ao Apps Script)
  context/       → Estado global e toasts
  components/
    ui/          → Componentes reutilizáveis (AutocompleteInput, Modais)
    vendas/      → Componentes da tela de vendas
  pages/         → Páginas da aplicação
supabase/
  schema.sql     → Execute este no Supabase para criar as tabelas
```
