# sellControl — Guia Completo de Setup e Deploy

## 1. Instalação Inicial

```bash
npm install
```

---

## 2. Configuração do Supabase

### 2.1 Criar as tabelas e políticas
1. Acesse seu projeto no [Supabase](https://supabase.com)
2. Vá em **SQL Editor** → **New Query**
3. Cole todo o conteúdo de `supabase/schema.sql` e clique **Execute**
4. Aguarde a conclusão (deve retornar "Success")

### 2.2 Criar o tenant (empresa/workspace)
No **SQL Editor**, execute:
```sql
INSERT INTO tenants (nome) VALUES ('Sua Empresa') RETURNING id;
```
⚠️ **Copie o UUID retornado** — você precisará dele nos próximos passos.

### 2.3 Criar um usuário administrador
1. Vá em **Authentication** → **Users** → **Add user**
2. Preencha:
   - **Email**: seu@email.com
   - **Password**: uma senha forte
3. Clique **Create user**

### 2.4 Criar o perfil do usuário no banco
No **SQL Editor**, execute (substitua os valores):
```sql
INSERT INTO users_perfil (id, tenant_id, role, nome)
SELECT id, 'SEU-TENANT-UUID-AQUI', 'master', 'Seu Nome'
FROM auth.users
WHERE email = 'seu@email.com';
```

### 2.5 Criar as páginas iniciais (opcional)
Para que o menu já mostre "Dashboard" e "Vendas", execute:
```sql
INSERT INTO pages (tenant_id, slug, label, category, icon, order_index) VALUES
  ('SEU-TENANT-UUID-AQUI', 'dashboard', 'Dashboard', 'Principal', 'dashboard', 10),
  ('SEU-TENANT-UUID-AQUI', 'vendas', 'Vendas', 'Operações', 'sell', 20);
```

### 2.6 Dar acesso ao usuário master às páginas (opcional)
```sql
INSERT INTO pages_access (user_id, page_id, tenant_id)
SELECT 
  up.id, 
  p.id, 
  'SEU-TENANT-UUID-AQUI'
FROM users_perfil up
CROSS JOIN pages p
WHERE up.email = 'seu@email.com' 
  AND p.tenant_id = 'SEU-TENANT-UUID-AQUI';
```

> 💡 **Nota**: Usuários com role `master` têm acesso automático a todas as páginas. Usuários com role `user` ou `admin` precisam de permissões explícitas em `pages_access`.

---

## 3. Variáveis de ambiente

### 3.1 Criar arquivo `.env`
1. Na raiz do projeto, crie um arquivo chamado `.env`
2. Preencha com seus dados do Supabase:

```env
VITE_SUPABASE_URL=https://SEU_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key_publica
VITE_TENANT_ID=SEU-TENANT-UUID-AQUI
```

**Para encontrar essas informações**:
- Vá em **Project Settings** → **API**
- `VITE_SUPABASE_URL` = URL do projeto
- `VITE_SUPABASE_ANON_KEY` = Key anônima (public)

---

## 4. Rodar localmente

```bash
npm run dev
```

Acesse: **http://localhost:5173**

### Fluxo de login:
1. Você será redirecionado para `/login`
2. Entre com o email e senha criados no passo 2.3
3. Será redirecionado para `/dashboard` (menu global)
4. O menu mostrará links para as páginas que você tem acesso

### Rotas principais:
- `/login` — Tela de login
- `/dashboard` — Painel com informativos (comunicação interna)
- `/vendas` — Tela de gestão de vendas
- `/admin` — Configuração de usuários e páginas (**apenas master/admin**)

---

## 5. Build para produção

```bash
npm run build
```

Isso gerará a pasta `dist/` pronta para deploy.

---

## 6. Deploy no Vercel

### 6.1 Importar o repositório
1. Acesse [vercel.com](https://vercel.com)
2. Clique em **Add New...** → **Project**
3. Selecione seu repositório GitHub (ou importe a pasta do projeto)

### 6.2 Configurar variáveis de ambiente
1. Na aba **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_TENANT_ID`
2. Copie os mesmos valores do arquivo `.env` local

### 6.3 Deploy
Clique em **Deploy** — o Vercel fará build automaticamente.

> ⚠️ **Importante**: Não commit o arquivo `.env` no Git. Configure as variáveis diretamente no painel do Vercel.

---

## 7. Fluxo de uso

### Usuário Master (admin)
- Acesso a **todas as páginas** automaticamente
- Pode usar a aba `/admin` para:
  - Criar novas páginas
  - Gerenciar quem tem acesso a quais páginas
  - Criar avisos/informativos para todos

### Usuário comum
- Vê apenas as páginas que o master liberou em `/admin`
- Pode abrir avisos em `/dashboard`

---

## 8. Estrutura do projeto

```
src/
  lib/
    supabase.js              → Cliente Supabase
  services/
    vendasService.js         → CRUD de vendas
    authService.js           → Perfil, páginas, acesso
    appService.js            → Informativos
  context/
    AppContext.jsx           → Estado global (toasts)
    AuthContext.jsx          → Sessão e menu dinâmico
  components/
    ui/
      AppShell.jsx           → Menu e layout global
      TopLoader.jsx
      ModalConfirmacao.jsx
      ModalAlerta.jsx
      Toast.jsx
    vendas/
      TabelaRow.jsx
      ModalCadastro.jsx
      ModalEdicao.jsx
      ModalFila.jsx
      LinhaVenda.jsx
      Modais.jsx
  pages/
    LoginPage.jsx            → Tela de login
    DashboardPage.jsx        → Painel com informativos
    AdminPage.jsx            → Configuração de acesso
    vendas/
      VendasPage.jsx         → Gestão de vendas
  App.jsx                    → Rotas e providers
  index.css                  → Estilos (dark theme)
  main.jsx                   → Entrada da app

supabase/
  schema.sql                 → Define todas as tabelas e RLS
  functions/
    receber-pedido-live/     → Função Edge para webhooks
```

---

## 9. Troubleshooting

### Mensagem: "Perfil não encontrado"
- Verifique se você criou a linha em `users_perfil` com o email correto
- Confirme que o `tenant_id` é o mesmo em todas as tabelas

### Página fica em branco após login
- Abra **DevTools** (F12) → **Console** para ver erros
- Verifique as variáveis de ambiente em `/login` (inspecione page source)

### Menu não mostra nenhuma página
- Você é `master`? Se não, insert em `pages_access` para seu user_id
- Se for `master`, as páginas default (Dashboard, Vendas) devem aparecer

### Erro 401 no Supabase
- Confirme que `VITE_SUPABASE_ANON_KEY` é a chave **pública** (anon), não a chave service_role

---

## 10. Dicas de segurança
- ✅ Nunca commit `.env` no Git
- ✅ Configure `.env` no Vercel, não em arquivo
- ✅ Use `service_role` apenas em Edge Functions (nunca no frontend)
- ✅ As políticas RLS protegem acesso ao banco por tenant e role
- ✅ Mude as senhas dos usuários de teste antes de produção
