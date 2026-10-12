# 🎟️ Debug: Sistema de Cupons - Contador de Usos

## Problema Identificado

Os cupons de desconto não estavam contabilizando os usos (`usos_realizados` não era incrementado).

## Causa Raiz

O sistema já tinha a lógica de incremento implementada em:
- ✅ `api/webhook.js` - Incrementa quando webhook do MP confirma pagamento
- ✅ `api/confirmar-pagamento.js` - Incrementa quando pagamento é confirmado manualmente
- ✅ `src/pages/cobrancas/CobrancasPage.jsx` - Incrementa quando cobrança é baixada manualmente

**Porém**, para funcionar, é necessário que o `cupom_id` seja salvo na cobrança quando o cupom é aplicado.

## Solução Implementada

### 1. Melhorias de Logging (✅ Implementado)

Adicionados logs detalhados em:
- `api/aplicar-cupom.js` - Mostra quando cupom_id é salvo
- `api/webhook.js` - Mostra todo o fluxo de incremento
- `api/confirmar-pagamento.js` - Mostra todo o fluxo de incremento

### 2. Scripts de Verificação e Correção

#### A. Verificar estrutura do banco
Execute no SQL Editor do Supabase:
```sql
-- Veja o conteúdo completo em:
-- supabase/migrations/20261012_verify_cupom_tracking.sql
```

#### B. Corrigir dados históricos
⚠️ **EXECUTE APENAS UMA VEZ**

Este script vai:
1. Popular `cupom_id` em cobranças antigas que foram pagas mas não tinham o ID
2. Recalcular `usos_realizados` de todos os cupons baseado nas cobranças PAGAS

```sql
-- Veja o conteúdo completo em:
-- supabase/migrations/20261012_fix_cupom_historico.sql
```

## Como Testar

### 1. Aplicar um cupom em uma nova cobrança

1. Acesse `Cobranças` > selecione uma cobrança PENDENTE
2. No recibo público, aplique um cupom válido
3. Verifique nos logs do Vercel se aparece:
   ```
   🎟️ Aplicando cupom: { cupom_id: '...', ... }
   ✅ Cupom aplicado com sucesso! cupom_id salvo: <uuid>
   ```

### 2. Pagar a cobrança

Ao confirmar o pagamento (via MP ou baixar manualmente), verifique nos logs:
```
🔍 Verificando cupom_id: <uuid>
🎟️ Cupom encontrado! Incrementando uso do cupom...
📊 Incrementando de X para Y
✅ Cupom <uuid> incrementado: Y usos
```

### 3. Verificar no frontend

1. Acesse `/cupons`
2. Verifique se o cupom mostra:
   - `Usado X/Y vezes` (com o contador atualizado)
   - Se `X >= Y`, deve aparecer como ESGOTADO

## Logs do Vercel

Para acessar os logs e verificar se está funcionando:

1. Acesse [Vercel Dashboard](https://vercel.com)
2. Selecione o projeto `sellcontrol`
3. Vá em `Logs` (aba superior)
4. Filtre por:
   - Função: `api/webhook` ou `api/confirmar-pagamento` ou `api/aplicar-cupom`
   - Busque por: `🎟️` ou `cupom`

## Checklist de Verificação

- [ ] Migration `cupom_id` aplicada no Supabase
- [ ] Coluna `cupom_id` existe na tabela `cobrancas`
- [ ] Script de correção histórica executado (se houver dados antigos)
- [ ] Logs aparecem no Vercel quando cupom é aplicado
- [ ] Logs aparecem no Vercel quando pagamento é confirmado
- [ ] Contador `usos_realizados` incrementa corretamente
- [ ] Frontend mostra contador atualizado

## Estrutura do Banco

```sql
-- Tabela cupons
cupons (
  id UUID PRIMARY KEY,
  codigo TEXT,
  percentual NUMERIC,
  limite_usos INTEGER,      -- Limite de usos (NULL = ilimitado)
  usos_realizados INTEGER,  -- Contador de usos efetivos
  ...
)

-- Tabela cobrancas
cobrancas (
  id UUID PRIMARY KEY,
  cupom_codigo TEXT,              -- Código do cupom (para histórico)
  cupom_desconto_percentual NUMERIC,
  cupom_desconto_valor NUMERIC,
  cupom_id UUID,                  -- FK para cupons(id) - ESSENCIAL!
  status TEXT,                    -- PENDENTE | PAGO | BAIXADO | CANCELADO
  ...
)
```

## Fluxo Completo

```
1. Cliente aplica cupom no recibo
   ↓
2. ReciboPage.jsx chama /api/aplicar-cupom
   ↓
3. API salva na cobrança:
   - cupom_codigo (para histórico)
   - cupom_desconto_percentual
   - cupom_desconto_valor
   - cupom_id ⬅️ ESSENCIAL PARA INCREMENTO!
   - total (com desconto)
   ↓
4. Cliente paga (via MP ou PIX/Dinheiro)
   ↓
5a. Via MP: webhook.js recebe notificação
    OU
5b. Manual: CobrancasPage.jsx baixa cobrança
    OU
5c. Confirmação: confirmar-pagamento.js confirma
   ↓
6. Sistema verifica se cobrança tem cupom_id
   ↓
7. Se sim: incrementa cupons.usos_realizados
   ↓
8. Frontend mostra contador atualizado
```

## Data de Criação
12/10/2026

## Autor
Ederson Jeremias (com assistência de Claude Sonnet 4.5)
