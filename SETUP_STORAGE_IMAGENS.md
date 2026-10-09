# 🗂️ Configuração do Supabase Storage para Imagens de Produtos

## 📋 Passos para configurar:

### 1. Executar SQL Migration
No **Supabase SQL Editor**, execute o arquivo:
```
add_produtos_imagens.sql
```

Isso adiciona a coluna `imagens` na tabela `produtos`.

---

### 2. Criar Bucket no Storage

1. Acesse o **Supabase Dashboard**
2. Vá em **Storage** (menu lateral)
3. Clique em **"New bucket"**
4. Configure:
   - **Name**: `produtos-imagens`
   - **Public bucket**: ✅ **Marque** (para URLs públicas)
   - **File size limit**: `5MB`
   - **Allowed MIME types**: 
     - `image/jpeg`
     - `image/png`  
     - `image/webp`

---

### 3. Configurar Políticas de Acesso (RLS)

No bucket `produtos-imagens`, configure as seguintes políticas:

#### **Política 1: Upload (INSERT)**
```sql
-- Permite upload de imagens para o próprio tenant
CREATE POLICY "Tenants podem fazer upload de suas imagens"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'produtos-imagens' 
  AND (storage.foldername(name))[1] = auth.jwt() ->> 'tenant_id'
);
```

#### **Política 2: Leitura (SELECT)**
```sql
-- Permite leitura pública das imagens
CREATE POLICY "Imagens são públicas para leitura"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'produtos-imagens');
```

#### **Política 3: Deleção (DELETE)**
```sql
-- Permite deletar apenas imagens do próprio tenant
CREATE POLICY "Tenants podem deletar suas imagens"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'produtos-imagens'
  AND (storage.foldername(name))[1] = auth.jwt() ->> 'tenant_id'
);
```

---

### 4. Testar

1. Acesse a página **Cadastro de Produtos**
2. Clique no botão **📷** de um produto salvo
3. Faça upload de uma imagem (JPG, PNG ou WEBP)
4. Verifique se aparece na galeria

---

## ✅ Pronto!

Agora seus produtos podem ter até **3 imagens** cada! 🎉

### Recursos:
- ✅ Upload drag & drop
- ✅ Até 3 imagens por produto
- ✅ Formatos: JPG, PNG, WEBP
- ✅ Máximo 5MB por imagem
- ✅ Badge mostra quantidade de fotos
- ✅ Galeria com zoom
- ✅ Fácil de remover imagens
