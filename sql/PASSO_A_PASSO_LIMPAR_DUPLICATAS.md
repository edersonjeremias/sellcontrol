# 🎯 PASSO A PASSO: Limpar Duplicatas EA SECOND HAND

## ✅ **O que vamos fazer?**

Limpar clientes duplicados mantendo apenas o registro CORRETO (com `@`)

---

## 📋 **ETAPA 1: INVESTIGAR** (5 minutos)

### **Passo 1.1 - Ver quantos clientes você tem**

Cole no Supabase SQL Editor:

```sql
SELECT 
  COUNT(*) as total_clientes,
  COUNT(CASE WHEN nome_completo IS NOT NULL THEN 1 END) as com_nome_completo,
  COUNT(CASE WHEN instagram NOT LIKE '@%' THEN 1 END) as sem_arroba
FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe';
```

**Resultado esperado:**
```
total_clientes | com_nome_completo | sem_arroba
200            | 50                | 25
```

📝 **Anote:** `sem_arroba` = quantos clientes precisam ser corrigidos

---

### **Passo 1.2 - Ver as duplicatas**

```sql
SELECT 
  whatsapp,
  COUNT(*) as total,
  STRING_AGG(instagram, ' | ') as instagrams
FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND whatsapp IS NOT NULL 
GROUP BY whatsapp
HAVING COUNT(*) > 1;
```

**Resultado esperado:**
```
whatsapp      | total | instagrams
67999717758   | 2     | @cleo.bgomes | cleo.bgomes
31989749082   | 2     | @st.criiss | st.criiss
```

📝 **Anote:** Quantas duplicatas você tem

---

### **Passo 1.3 - Ver duplicatas lado a lado**

```sql
WITH duplicatas AS (
  SELECT whatsapp FROM clientes
  WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
    AND whatsapp IS NOT NULL 
  GROUP BY whatsapp HAVING COUNT(*) > 1
)
SELECT 
  c.instagram,
  c.nome_completo,
  c.whatsapp,
  CASE 
    WHEN c.instagram LIKE '@%' THEN '✅ MANTER'
    ELSE '❌ EXCLUIR'
  END as acao
FROM clientes c
INNER JOIN duplicatas d ON c.whatsapp = d.whatsapp
WHERE c.tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
ORDER BY c.whatsapp, c.instagram DESC;
```

**Resultado esperado:**
```
instagram      | nome_completo | whatsapp    | acao
@cleo.bgomes   | Leila Gomes   | 67999717758 | ✅ MANTER
cleo.bgomes    | Leila Gomes   | 67999717758 | ❌ EXCLUIR
```

---

## 💾 **ETAPA 2: BACKUP** (1 minuto)

⚠️ **IMPORTANTE:** Sempre faça backup antes de excluir!

```sql
CREATE TABLE IF NOT EXISTS clientes_backup_duplicatas_20261012 AS
SELECT * FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND instagram NOT LIKE '@%'
  AND whatsapp IN (
    SELECT whatsapp FROM clientes
    WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
      AND whatsapp IS NOT NULL 
    GROUP BY whatsapp HAVING COUNT(*) > 1
  );

-- Verificar backup
SELECT COUNT(*) FROM clientes_backup_duplicatas_20261012;
```

✅ **Se aparecer um número, o backup foi criado!**

---

## 🔄 **ETAPA 3: MESCLAR DADOS** (2 minutos)

Copiar dados dos registros SEM `@` para os COM `@`:

```sql
UPDATE clientes AS destino
SET 
  nome_completo = COALESCE(NULLIF(destino.nome_completo, ''), origem.nome_completo),
  cpf_cnpj = COALESCE(NULLIF(destino.cpf_cnpj, ''), origem.cpf_cnpj),
  email = COALESCE(NULLIF(destino.email, ''), origem.email),
  telefone = COALESCE(NULLIF(destino.telefone, ''), origem.telefone),
  tipo_pessoa = COALESCE(NULLIF(destino.tipo_pessoa, ''), origem.tipo_pessoa)
FROM (
  SELECT 
    c1.whatsapp,
    c2.nome_completo, c2.cpf_cnpj, c2.email, c2.telefone, c2.tipo_pessoa
  FROM clientes c1
  INNER JOIN clientes c2 
    ON c1.whatsapp = c2.whatsapp AND c1.tenant_id = c2.tenant_id
  WHERE c1.tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
    AND c1.instagram LIKE '@%'
    AND c2.instagram NOT LIKE '@%'
    AND c1.whatsapp IS NOT NULL
) AS origem
WHERE destino.tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND destino.whatsapp = origem.whatsapp
  AND destino.instagram LIKE '@%';
```

**Resultado:** `UPDATE X` (X = quantos registros foram atualizados)

---

## 🗑️ **ETAPA 4: EXCLUIR DUPLICATAS** (1 minuto)

### **Passo 4.1 - CONTAR quantos serão excluídos**

⚠️ **Não pule este passo!**

```sql
SELECT COUNT(*) as total_que_sera_excluido
FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND instagram NOT LIKE '@%'
  AND whatsapp IN (
    SELECT whatsapp FROM clientes
    WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
      AND whatsapp IS NOT NULL 
    GROUP BY whatsapp HAVING COUNT(*) > 1
  );
```

📝 **Anote o número que aparecer**

---

### **Passo 4.2 - EXCLUIR duplicatas**

⚠️ **Só rode se o número acima estiver correto!**

```sql
DELETE FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND instagram NOT LIKE '@%'
  AND whatsapp IN (
    SELECT whatsapp FROM clientes
    WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
      AND whatsapp IS NOT NULL 
    GROUP BY whatsapp HAVING COUNT(*) > 1
  );
```

**Resultado:** `DELETE X` (X deve ser igual ao número da contagem)

---

## ✅ **ETAPA 5: VERIFICAR** (2 minutos)

### **Passo 5.1 - Verificar se ainda há duplicatas**

```sql
SELECT whatsapp, COUNT(*) as total
FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND whatsapp IS NOT NULL 
GROUP BY whatsapp
HAVING COUNT(*) > 1;
```

✅ **Se retornar VAZIO = SUCESSO!** Não há mais duplicatas!

---

### **Passo 5.2 - Normalizar instagrams restantes**

Adicionar `@` nos clientes que faltam (que NÃO eram duplicatas):

```sql
UPDATE clientes
SET instagram = '@' || instagram
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
  AND instagram NOT LIKE '@%'
  AND instagram IS NOT NULL
  AND instagram != '';
```

---

### **Passo 5.3 - Estatísticas finais**

```sql
SELECT 
  COUNT(*) as total_clientes,
  COUNT(CASE WHEN instagram LIKE '@%' THEN 1 END) as com_arroba,
  COUNT(CASE WHEN instagram NOT LIKE '@%' THEN 1 END) as sem_arroba
FROM clientes
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe';
```

✅ **Esperado:** `sem_arroba = 0`

---

## 🎉 **PRONTO!**

Suas duplicatas foram limpas! Agora:

1. ✅ Todos os clientes com `@`
2. ✅ Sem duplicatas
3. ✅ Dados mesclados corretamente

---

## 🆘 **E SE ALGO DEU ERRADO?**

### **Restaurar do backup:**

```sql
-- Ver o que tem no backup
SELECT * FROM clientes_backup_duplicatas_20261012 LIMIT 10;

-- Restaurar tudo
INSERT INTO clientes
SELECT * FROM clientes_backup_duplicatas_20261012;
```

---

## 🧹 **LIMPEZA (Opcional)**

Depois de confirmar que tudo está OK, excluir o backup:

```sql
DROP TABLE clientes_backup_duplicatas_20261012;
```

---

## 📊 **RESUMO**

| Etapa | Tempo | Status |
|-------|-------|--------|
| 1. Investigar | 5 min | ⏳ |
| 2. Backup | 1 min | ⏳ |
| 3. Mesclar | 2 min | ⏳ |
| 4. Excluir | 1 min | ⏳ |
| 5. Verificar | 2 min | ⏳ |
| **TOTAL** | **11 min** | |

---

**Pronto para começar?** 🚀

Abra o arquivo `LIMPAR_DUPLICATAS_EA_SECOND_HAND.sql` e vá seguindo passo a passo!
