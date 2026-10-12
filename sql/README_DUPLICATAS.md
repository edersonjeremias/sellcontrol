# 🔧 Investigar e Corrigir Duplicatas de Clientes

## 📋 Problema Identificado

Após importação do Bling, clientes ficaram duplicados:
- ✅ Um registro com `@instagram` (correto)
- ❌ Um registro sem `@` (incompleto)

**Causa:** Importação antiga removia `@` e não verificava duplicatas por WhatsApp.

---

## 🛠️ Passo a Passo para Corrigir

### **1️⃣ Descobrir seu TENANT_ID**

Acesse o Supabase SQL Editor e rode:

```sql
SELECT 
  tenant_id,
  nome_loja,
  slug
FROM configuracoes
ORDER BY created_at DESC;
```

📝 **Anote o `tenant_id`** (ex: `ea-second-hand`)

---

### **2️⃣ Investigar Duplicatas**

Cole este SQL no Supabase (substitua `ea-second-hand` pelo seu tenant_id):

```sql
-- Ver duplicatas agrupadas por WhatsApp
SELECT 
  whatsapp,
  COUNT(*) as total,
  STRING_AGG(instagram, ' | ') as instagrams,
  STRING_AGG(nome_completo, ' | ') as nomes
FROM clientes
WHERE tenant_id = 'ea-second-hand'
  AND whatsapp IS NOT NULL 
  AND whatsapp != ''
GROUP BY whatsapp
HAVING COUNT(*) > 1
ORDER BY total DESC;
```

**Resultado esperado:**
```
whatsapp      | total | instagrams              | nomes
67999717758   | 2     | @cleo.bgomes | cleo     | Leila | Leila
```

---

### **3️⃣ Ver Duplicatas Lado a Lado**

```sql
WITH duplicatas AS (
  SELECT whatsapp
  FROM clientes
  WHERE tenant_id = 'ea-second-hand'
    AND whatsapp IS NOT NULL 
  GROUP BY whatsapp
  HAVING COUNT(*) > 1
)
SELECT 
  c.instagram,
  c.nome_completo,
  c.whatsapp,
  c.cpf_cnpj,
  CASE 
    WHEN c.instagram LIKE '@%' THEN '✅ MANTER'
    ELSE '❌ EXCLUIR'
  END as acao
FROM clientes c
INNER JOIN duplicatas d ON c.whatsapp = d.whatsapp
WHERE c.tenant_id = 'ea-second-hand'
ORDER BY c.whatsapp, c.instagram;
```

---

### **4️⃣ Mesclar Dados (antes de excluir)**

Para cada duplicata, copie os dados do registro INCOMPLETO para o CORRETO:

```sql
-- EXEMPLO: Copiar dados de 'cleo' para '@cleo.bgomes'
UPDATE clientes
SET 
  nome_completo = COALESCE(NULLIF(nome_completo, ''), 
    (SELECT nome_completo FROM clientes 
     WHERE tenant_id = 'ea-second-hand'
       AND whatsapp = '67999717758' 
       AND instagram NOT LIKE '@%' 
     LIMIT 1)
  ),
  cpf_cnpj = COALESCE(NULLIF(cpf_cnpj, ''), 
    (SELECT cpf_cnpj FROM clientes 
     WHERE tenant_id = 'ea-second-hand'
       AND whatsapp = '67999717758' 
       AND instagram NOT LIKE '@%' 
     LIMIT 1)
  ),
  email = COALESCE(NULLIF(email, ''), 
    (SELECT email FROM clientes 
     WHERE tenant_id = 'ea-second-hand'
       AND whatsapp = '67999717758' 
       AND instagram NOT LIKE '@%' 
     LIMIT 1)
  )
WHERE tenant_id = 'ea-second-hand'
  AND whatsapp = '67999717758'
  AND instagram LIKE '@%';
```

📝 **Repita para cada whatsapp duplicado**

---

### **5️⃣ Excluir Duplicatas (SEM @)**

⚠️ **ATENÇÃO:** Execute apenas após mesclar os dados!

```sql
-- Excluir registros SEM @ que têm duplicata COM @
DELETE FROM clientes
WHERE tenant_id = 'ea-second-hand'
  AND instagram NOT LIKE '@%'
  AND whatsapp IN (
    SELECT whatsapp
    FROM clientes
    WHERE tenant_id = 'ea-second-hand'
      AND whatsapp IS NOT NULL 
      AND whatsapp != ''
    GROUP BY whatsapp
    HAVING COUNT(*) > 1
  );
```

---

### **6️⃣ Verificar Resultado**

```sql
-- Deve retornar 0 linhas
SELECT 
  whatsapp,
  COUNT(*) as total
FROM clientes
WHERE tenant_id = 'ea-second-hand'
  AND whatsapp IS NOT NULL 
GROUP BY whatsapp
HAVING COUNT(*) > 1;
```

✅ **Se retornar vazio = Sucesso!**

---

## 🎯 Correção Preventiva

A correção no código já foi feita! Próximas importações:
- ✅ Sempre adicionam `@` no instagram
- ✅ Verificam duplicatas por WhatsApp
- ✅ Atualizam registro existente ao invés de duplicar

---

## 📞 Suporte

Caso tenha dúvidas, use os scripts em:
- `sql/investigar_duplicatas_clientes.sql` - Scripts completos
- `sql/debug_busca_clientes.sql` - Debug da busca avançada
