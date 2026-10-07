# 🚀 Migração: Configurações de Etiquetas no Banco de Dados

## ⚠️ IMPORTANTE - Execute ANTES de usar a nova versão

Para que as configurações de layout de etiquetas sejam salvas no banco de dados (e não mais no localStorage), você precisa executar uma migração SQL no Supabase.

## 📋 Passo a Passo

### 1. Acesse o Supabase Dashboard
- Vá para: https://supabase.com/dashboard
- Entre no seu projeto

### 2. Abra o SQL Editor
- No menu lateral, clique em **SQL Editor**
- Clique em **New query**

### 3. Copie e Cole o SQL
Copie TODO o conteúdo do arquivo: **`supabase/migrations/create_config_etiquetas.sql`**

Ou copie o SQL abaixo:

```sql
-- Criar tabela para salvar configurações de layout de etiquetas
CREATE TABLE IF NOT EXISTS config_etiquetas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  layout JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id)
);

-- Criar índice para busca rápida por tenant
CREATE INDEX IF NOT EXISTS idx_config_etiquetas_tenant_id ON config_etiquetas(tenant_id);

-- Habilitar RLS
ALTER TABLE config_etiquetas ENABLE ROW LEVEL SECURITY;

-- Policy: usuários podem ver apenas configurações do seu tenant
CREATE POLICY "Usuários podem ver config de etiquetas do seu tenant"
  ON config_etiquetas FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
  ));

-- Policy: usuários podem inserir config para seu tenant
CREATE POLICY "Usuários podem inserir config de etiquetas do seu tenant"
  ON config_etiquetas FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
  ));

-- Policy: usuários podem atualizar config do seu tenant
CREATE POLICY "Usuários podem atualizar config de etiquetas do seu tenant"
  ON config_etiquetas FOR UPDATE
  USING (tenant_id IN (
    SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
  ));
```

### 4. Execute
- Cole o SQL no editor
- Clique em **Run** (ou pressione Ctrl+Enter / Cmd+Enter)
- Aguarde a confirmação de sucesso

### 5. Verifique
- No menu lateral, clique em **Table Editor**
- Procure pela tabela **config_etiquetas**
- Ela deve estar criada e vazia

## ✅ Pronto!

Agora suas configurações de layout de etiquetas serão:
- ✅ Salvas no banco de dados
- ✅ Compartilhadas entre computadores
- ✅ Não perdem ao limpar cache
- ✅ Automáticas (salvam 1 segundo após cada alteração)

## 🔄 Migração Automática das Configurações Antigas

Não se preocupe! Se você já tinha configurações salvas no navegador:
- Na **primeira vez** que abrir a página de etiquetas após atualizar, configure novamente
- As novas configurações serão salvas automaticamente no banco
- A partir daí, funcionará em qualquer computador

## 🆘 Problemas?

Se encontrar algum erro ao executar o SQL:
1. Verifique se a tabela `tenants` existe
2. Verifique se a tabela `usuarios` existe
3. Se o erro persistir, tire um print e entre em contato

---

**Data da migração:** 06/10/2026  
**Versão:** 1.0
