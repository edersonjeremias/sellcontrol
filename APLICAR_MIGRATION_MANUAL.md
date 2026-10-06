# 🚀 Como Aplicar a Migration Manualmente

## Passo 1: Acessar Supabase Dashboard

1. Acesse [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Selecione seu projeto SellControl
3. No menu lateral, clique em **SQL Editor**

## Passo 2: Executar Migration

Copie e cole este SQL no editor:

```sql
-- ============================================================================
-- EXPANSÃO DA TABELA CLIENTES PARA SUPORTAR DADOS COMPLETOS DO BLING
-- ============================================================================
-- Data: 02/08/2026
-- Motivo: Importação de clientes do Bling com dados completos
--         (nome, CPF, email, telefone, endereço)
-- ============================================================================

-- Adicionar campos completos do cliente
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nome_completo TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tipo_pessoa TEXT DEFAULT 'fisica'; -- 'fisica' ou 'juridica'

-- Índices para busca
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(tenant_id, nome_completo);
CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(tenant_id, cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes(tenant_id, email);

COMMENT ON COLUMN clientes.nome_completo IS 'Nome completo do cliente (pessoa física) ou Razão Social (pessoa jurídica)';
COMMENT ON COLUMN clientes.cpf_cnpj IS 'CPF ou CNPJ do cliente';
COMMENT ON COLUMN clientes.telefone IS 'Telefone fixo do cliente';
COMMENT ON COLUMN clientes.email IS 'E-mail do cliente';
COMMENT ON COLUMN clientes.tipo_pessoa IS 'Tipo de pessoa: fisica ou juridica';
```

## Passo 3: Executar

1. Clique em **Run** (ou pressione Ctrl+Enter)
2. Aguarde a mensagem de sucesso
3. Pronto! A tabela foi expandida

## Passo 4: Verificar

Execute este SQL para confirmar:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'clientes' 
ORDER BY ordinal_position;
```

Você deve ver as novas colunas:
- `nome_completo`
- `cpf_cnpj`
- `telefone`
- `email`
- `tipo_pessoa`

---

✅ **Depois disso, você já pode usar a importação do Bling!**
