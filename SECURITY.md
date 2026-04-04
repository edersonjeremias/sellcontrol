# Guia de Segurança e Controle de Acesso

## Auto-Registro (Signup)

### Como funciona
1. Qualquer pessoa pode acessar `/signup` e se registrar
2. Ao registrar, o novo usuário **automaticamente** vira `master`
3. Master tem acesso a **todas as páginas** e pode gerenciar outras pessoas

### Variação 1: Signup aberto (atual)
**Ideal para**: Time interno, startup, organizações pequenas.
- ✅ Qualquer pessoa pode entrar
- ✅ Novo usuário já vira master
- ✅ Master pode depois mudar role de outro usuário para `user` ou `admin`

### Variação 2: Desabilitar signup (para produção segura)

Se você quer que **apenas administradores** possam criar usuários, comente a rota de signup:

```jsx
// src/App.jsx
<Routes>
  <Route path="/" element={<LoginPage />} />
  {/* <Route path="/signup" element={<SignupPage />} /> */}  {/* Desabilitado */}
  <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
  ...
</Routes>
```

Depois, qualquer novo usuário deve ser criado manualmente:
1. **No Supabase Auth**: Vá em **Authentication > Users > Add user**
2. **No banco**: Insira em `users_perfil` com role desejada

### Variação 3: Signup com email de domínio permitido

Para permitir signup apenas de emails de um domínio específico (ex: `@suaempresa.com`):

```jsx
// src/pages/SignupPage.jsx
const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN || '@suaempresa.com'

const handleSubmit = async (e) => {
  // ... validações ...
  
  if (!formData.email.endsWith(ALLOWED_DOMAIN)) {
    setError(`Use um email de ${ALLOWED_DOMAIN}`)
    return
  }
  
  // ... resto do código ...
}
```

Depois, adicione no `.env`:
```env
VITE_ALLOWED_DOMAIN=@suaempresa.com
```

E configure no Vercel também.

---

## Gerenciar Usuários Após Signup

### Mudar role de um usuário

No **SQL Editor** do Supabase:
```sql
UPDATE users_perfil
SET role = 'user'  -- ou 'admin'
WHERE email = 'usuario@email.com'
AND tenant_id = 'seu-tenant-uuid';
```

**Roles disponíveis**:
- `master` — Acesso total (admin)
- `admin` — Admin de departamento
- `user` — Usuário comum

### Remover usuário

```sql
-- 1. Deletar do banco de dados
DELETE FROM users_perfil
WHERE email = 'usuario@email.com'
AND tenant_id = 'seu-tenant-uuid';

-- 2. Deletar do Auth do Supabase (painel web)
-- Authentication > Users > clique no usuário > Delete user
```

---

## Controlar páginas por usuário

Um `user` comum **não vê nenhuma página** até que você der acesso em `/admin`.

### Como dar acesso:
1. Faça login como `master`
2. Vá em `/admin`
3. Selecione o usuário na dropdown
4. Marque as páginas que ele pode acessar
5. Clique **Salvar permissões**

---

## Row-Level Security (RLS)

Todas as tabelas têm **RLS habilitado**. Exemplos:

### Vendas
- Usuário só vê vendas do seu próprio `tenant_id`
- Você não consegue acessar dados de outro cliente

### Informativos
- Você só vê informativos do seu `tenant_id`
- Master pode ver todos do seu tenant

### Pages
- Master vê todas as páginas
- User comum vê apenas as páginas que foi liberado

---

## Variáveis de ambiente de segurança

### `VITE_SUPABASE_ANON_KEY`
- É a chave **pública** — pode estar no frontend
- RLS no banco protege dados mesmo com essa chave exposta

### `VITE_SUPABASE_URL`
- URL pública do seu projeto

### `VITE_TENANT_ID`
- UUID do seu tenant
- Necessário para novo signup funcionar

### Nunca coloque no frontend:
- ❌ `VITE_SUPABASE_SERVICE_KEY` (chave privada)
- ❌ Senhas do banco
- ❌ API keys de terceiros

---

## Auditoria

### Saber quem fez o quê
Adicione um campo `created_by` e timestamp em tabelas importantes:

```sql
ALTER TABLE vendas ADD COLUMN created_by UUID REFERENCES auth.users(id);
ALTER TABLE informativos ADD COLUMN created_by UUID REFERENCES auth.users(id);
```

Depois, ao inserir, faça:
```jsx
await supabase.from('vendas').insert({
  // ... dados ...
  created_by: profile.id,  // Adicioar user_id
})
```

### Monitorar acessos
Verifique no **painel do Supabase**:
- Quantos usuários ativos
- Quantas requisições por dia
- Erros de autenticação

---

## Boas práticas

✅ **Faça**:
- Alterar senhas a cada 90 dias
- Revisar permissões mensalmente
- Usar email corporativo para signup
- Manter `.env` em `.gitignore`
- Configurar HTTPS em domínio customizado

❌ **Evite**:
- Compartilhar senha entre pessoas
- Usar senhas fracas (`123456`, `password`)
- Deixar `VITE_TENANT_ID` fixo — considere deixar vazio e pedir ao usuário
- Confiar apenas em RLS — valide também no backend se for API pública

---

## Suporte

Se tiver dúvidas sobre segurança:
1. Verifique [docs Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)
2. Consulte [OWASP Top 10](https://owasp.org/www-project-top-ten/)
3. Revise o código de signup em `src/pages/SignupPage.jsx`
