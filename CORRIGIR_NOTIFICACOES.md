# 🔧 Correção: Notificações não aparecem para outros usuários

## ❌ Problema Identificado

Quando você cria uma notificação com destinatário "TODOS", ela aparece apenas para você (criador) e não para outros usuários da empresa EA Second Hand (como a Stephany).

**Causa:** A policy de RLS (Row Level Security) da tabela `notificacoes` filtra apenas por `user_id`, ignorando o campo `destinatario`.

```sql
-- Policy atual (INCORRETA):
AND (user_id = auth.uid() OR user_id IS NULL)
```

Isso significa que um usuário só vê:
- Notificações onde `user_id` é dele mesmo
- Notificações do sistema (`user_id IS NULL`)

Mas quando você cria uma notificação manual, ela é criada com `user_id` do criador, então só o criador vê!

## ✅ Solução

Atualizar as policies para considerar o campo `destinatario`:

### Passos para Corrigir:

1. **Acesse o SQL Editor do Supabase:**
   https://supabase.com/dashboard/project/gtsdgkalolqzjmmwtvdv/sql

2. **Cole o SQL abaixo** e clique em **"Run"**:

```sql
-- Remove a policy antiga de SELECT
DROP POLICY IF EXISTS "usuarios_veem_proprias_notificacoes" ON notificacoes;

-- Cria nova policy de SELECT que considera o campo destinatario
CREATE POLICY "usuarios_veem_notificacoes_destinatario"
  ON notificacoes FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
    )
    AND (
      -- Vê suas próprias notificações
      user_id = auth.uid()
      -- Vê notificações do sistema (user_id NULL)
      OR user_id IS NULL
      -- Vê notificações destinadas a TODOS
      OR destinatario = 'TODOS'
      -- Vê notificações destinadas ao seu nome
      OR destinatario = (
        SELECT nome FROM users_perfil WHERE id = auth.uid()
      )
    )
  );

-- Remove policy antiga de UPDATE
DROP POLICY IF EXISTS "usuarios_atualizam_proprias_notificacoes" ON notificacoes;

-- Cria nova policy de UPDATE que considera o campo destinatario
CREATE POLICY "usuarios_atualizam_notificacoes_destinatario"
  ON notificacoes FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users_perfil WHERE id = auth.uid()
    )
    AND (
      -- Atualiza suas próprias notificações
      user_id = auth.uid()
      -- Atualiza notificações do sistema
      OR user_id IS NULL
      -- Atualiza notificações destinadas a TODOS
      OR destinatario = 'TODOS'
      -- Atualiza notificações destinadas ao seu nome
      OR destinatario = (
        SELECT nome FROM users_perfil WHERE id = auth.uid()
      )
    )
  );
```

3. **Teste:**
   - Crie uma nova notificação com destinatário "TODOS"
   - Faça login com outro usuário da EA Second Hand (Stephany)
   - Verifique se a notificação aparece no Kanban dela

## 📁 Arquivos Relacionados

- **Service:** [src/services/notificacoesConversasService.js](src/services/notificacoesConversasService.js#L107-L135)
- **Página:** [src/pages/notificacoes/NotificacoesPageKanban.jsx](src/pages/notificacoes/NotificacoesPageKanban.jsx#L36-L44)
- **Migration:** [supabase/migrations/20260621_notificacoes_conversas.sql](supabase/migrations/20260621_notificacoes_conversas.sql)
- **Policy Original:** [supabase/migrations/20260615_create_notificacoes_fixed.sql](supabase/migrations/20260615_create_notificacoes_fixed.sql#L31-L38)
- **SQL de Correção:** [sql/fix_notificacoes_destinatario_policy.sql](sql/fix_notificacoes_destinatario_policy.sql)

## 🎯 Resultado Esperado

Após executar o SQL:

- ✅ Notificações com `destinatario = 'TODOS'` aparecerão para **todos** os usuários da empresa
- ✅ Notificações com `destinatario = 'Stephany'` aparecerão apenas para a Stephany
- ✅ Notificações com `user_id = NULL` (sistema) aparecerão para todos
- ✅ Notificações pessoais (`user_id` específico) aparecerão apenas para o dono
