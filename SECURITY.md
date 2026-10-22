# Guia de Segurança e Controle de Acesso

## Criação de acessos — não existe auto-registro

### Como funciona
1. **Não há `/signup`.** A rota não existe e a página foi removida do projeto.
2. Acesso novo só é criado pelo master/admin em **Configurações → Usuários e
   Permissões**, que chama `api/criar-usuario.js` (roda com *service role*, no
   servidor, nunca no navegador).
3. **Login com Google não cria perfil.** Quem não tem linha em `users_perfil` é
   deslogado com um aviso para procurar o administrador.

### ⚠️ Falha corrigida em out/2026
O login com Google criava perfil automático com `role: 'master'`
(`createGoogleUserProfile`). Qualquer pessoa com conta Google que abrisse a tela
de login virava **master** — e master ignora o filtro de `tenant_id` no RLS, ou
seja, enxergava todas as empresas. Clientes da loja entraram no sistema assim.

Corrigido em:
- `src/services/authService.js` — função de criação automática removida
- `src/context/AuthContext.jsx` — sem perfil = logout imediato com aviso
- `sql/fix_master_automatico.sql` — limpeza dos masters indevidos + trava no banco

### Checklist para manter fechado
- `users_perfil` **não** pode ter policy de `INSERT` nem policy `FOR ALL`
  (uma policy `FOR ALL` sem `WITH CHECK` libera o INSERT pelo `USING`).
- Nenhum arquivo em `src/` pode fazer `.from('users_perfil').insert(...)`.
- O trigger `trg_bloqueia_master_indevido` impede que alguém que não é master
  conceda a função master, inclusive para si mesmo.

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
3. Revise o fluxo de login em `src/context/AuthContext.jsx` e a criação de
   usuários em `api/criar-usuario.js`
