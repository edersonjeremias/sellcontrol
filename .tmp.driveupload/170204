# Guia de Deployment no Vercel

## Opção 1: Deploy via GitHub (Recomendado)

### 1. Fazer push para o GitHub
```bash
git push origin main
```

### 2. Conectar no Vercel
1. Acesse [vercel.com](https://vercel.com) e faça login com GitHub
2. Clique em **Add New Project**
3. Selecione seu repositório do GitHub (sellcontrol)
4. Clique em **Import**

### 3. Configurar variáveis de ambiente
Na aba **Environment Variables**, adicione:
- **Name**: `VITE_SUPABASE_URL`  
  **Value**: `https://seu-project.supabase.co` (seu projeto Supabase)

- **Name**: `VITE_SUPABASE_ANON_KEY`  
  **Value**: sua chave anônima (pública) do Supabase

- **Name**: `VITE_TENANT_ID`  
  **Value**: UUID do seu tenant

### 4. Deploy
Clique em **Deploy** — o Vercel fará upload automaticamente.

> ☑️ Vercel detectará que é um projeto Vite e configurará tudo automaticamente.

---

## Opção 2: Deploy manual via CLI

### 1. Instalar Vercel CLI
```bash
npm install -g vercel
```

### 2. Fazer login
```bash
vercel login
```

### 3. Fazer deploy
```bash
vercel --prod
```

### 4. Configurar variáveis (na primeira execução)
Vercel pedirá para confirmar e configurar as variáveis de ambiente.

---

## Pós-Deploy

### Validar a aplicação
1. Acesse a URL gerada pelo Vercel
2. Você será redirecionado para `/login`
3. Entre com as credenciais criadas no Supabase
4. Verifique se o dashboard carrega corretamente

### Troubleshooting

**Erro 401/403 no login**
- Confirme que `VITE_SUPABASE_ANON_KEY` é a chave **pública**
- Verifique se `VITE_SUPABASE_URL` está correto

**Página fica em branco**
- Abra DevTools (F12) → Console
- Procure por mensagens de erro sobre acesso ao Supabase
- Verifique se a chave anônima tem permissão para a tabela `users_perfil`

**Menu não carrega**
- Confirme que você inseriu um registro em `users_perfil` com seu email
- Verfique se `tenant_id` está correto

---

## Domínio customizado (opcional)

1. Vá para **Settings** do seu projeto no Vercel
2. Clique em **Domains**
3. Adicione seu domínio (exemplo: app.suaempresa.com)
4. Siga as instruções de DNS

---

## Atualizar código em produção

Após fazer push no GitHub, Vercel fará deploy automaticamente:

```bash
git add .
git commit -m "seu mensagem aqui"
git push origin main
```

Vercel detectará a mudança e fará rebuild em até 2 minutos.

---

## Monitoramento

### Logs do Vercel
- Vá em **Deployments** → selecione o deploy
- Clique em **Logs** para ver erros de build/runtime

### Banco de dados
- Monitore usuários e dados em **Supabase Dashboard**
- Verifique políticas RLS caso haja acesso negado

---

## Dicas finais
- ✅ Use variáveis de ambiente — **nunca** coloque secrets no código
- ✅ Teste localmente antes de fazer push
- ✅ Monitore os logs do Vercel nas primeiras 24h
- ✅ Configure alertas no Supabase para detectar picos de uso
