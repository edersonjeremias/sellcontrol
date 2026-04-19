# SellControl — Manifesto do Projeto

> Documento para onboarding de novos desenvolvedores. Descreve o que é o sistema, onde chegamos e decisões técnicas importantes.

---

## O que é o sistema

SellControl é um sistema SaaS multi-tenant de gestão de vendas para lives no Instagram. Permite registrar vendas ao vivo, gerar cobranças com link de pagamento via Mercado Pago, e controlar recebimentos. Cada empresa (tenant) tem seus próprios dados, usuários e configurações isoladas.

**URL de produção:** https://sellcontrol.vercel.app  
**Repositório:** https://github.com/edersonjeremias/sellcontrol  
**Branch principal:** `main` (deploy automático via Vercel)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite 6 (JSX, sem TypeScript) |
| Roteamento | React Router DOM v6 |
| Backend / Banco | Supabase (PostgreSQL + Auth + Edge Functions) |
| Deploy | Vercel (frontend + serverless functions em `/api`) |
| Pagamentos | Mercado Pago (Checkout Pro) |
| Estilo | CSS puro (variáveis CSS em `src/index.css`), dark mode fixo |

---

## Variáveis de ambiente

### `.env` (frontend — prefixo `VITE_` obrigatório)
```
VITE_SUPABASE_URL=https://gtsdgkalolqzjmmwtvdv.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_MP_ACCESS_TOKEN=...         # Fallback — token real vem da tabela configuracoes
VITE_TENANT_ID=7135c82e-6155-41e5-9c42-638a94222bbe
```

### Vercel (serverless functions em `/api` — sem prefixo `VITE_`)
Configuradas via `npx vercel env add` ou painel Vercel:
```
MP_ACCESS_TOKEN
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

### Supabase Secrets (Edge Functions Deno)
Configuradas via `npx supabase secrets set`:
```
MP_ACCESS_TOKEN
SUPABASE_URL           # preenchido automaticamente pelo Supabase
SUPABASE_SERVICE_ROLE_KEY
```

---

## Estrutura de pastas relevante

```
sellcontrol/
├── api/
│   ├── webhook.js              # Serverless Vercel — recebe webhook MP
│   └── criar-usuario.js        # Serverless Vercel — cria usuário por login/senha (usa SERVICE_ROLE)
├── src/
│   ├── lib/
│   │   └── supabase.js         # Dois clientes: supabase (auth) e supabasePublic (sem sessão)
│   ├── context/
│   │   ├── AuthContext.jsx     # Sessão + profile. Init com timeout 6s para nunca travar no F5
│   │   └── AppContext.jsx      # Toast global + estado compartilhado
│   ├── components/ui/
│   │   └── AppShell.jsx        # Layout: header 44px + nav estilo Bling + links por role
│   ├── pages/
│   │   ├── vendas/VendasPage.jsx            # Registro de vendas ao vivo
│   │   ├── cobrancas/CobrancasPage.jsx      # Gestão de cobranças + links MP
│   │   ├── configuracoes/ConfiguracoesPage.jsx  # Config da empresa + usuários
│   │   ├── recibo/ReciboPage.jsx            # Página pública do recibo (sem auth)
│   │   ├── producao/                        # Módulo de produção
│   │   └── DashboardPage.jsx
│   └── services/
│       ├── vendasService.js     # CRUD vendas + finalizarLive + getDadosIniciais
│       ├── cobrancasService.js  # CRUD cobranças + gerarPreferenciaMp + créditos
│       ├── configService.js     # Config do tenant + gestão de usuários + cache do token MP
│       ├── appService.js        # Listas (produtos, modelos, cores, marcas)
│       └── authService.js
├── supabase/
│   ├── functions/
│   │   └── mercadopago-webhook/ # Edge Function Deno — processa confirmação de pagamento
│   ├── migrations/              # SQLs executados manualmente no SQL Editor
│   └── config.toml             # verify_jwt = false para o webhook
└── vercel.json                 # Proxy /api/mercadopago/* → api.mercadopago.com
```

---

## Tabelas do Supabase

Todas as tabelas têm RLS habilitado com policy permissiva para `authenticated`:

| Tabela | Descrição |
|---|---|
| `tenants` | Empresas cadastradas |
| `users_perfil` | Usuários com `id, nome, email, role, tenant_id` — **não é `profiles`** |
| `vendas` | Linhas de venda registradas nas lives |
| `cobrancas` | Cobranças geradas por cliente/live |
| `clientes` | Cadastro de clientes (instagram + whatsapp) |
| `lives` | Lives cadastradas |
| `creditos` | Saldo de crédito por cliente |
| `configuracoes` | Configurações por tenant: token MP, nome loja, whatsapp, email |
| `listas_produtos` / `listas_modelos` / `listas_cores` / `listas_marcas` | Listas de autocomplete |

### Migrations críticas (executar em ordem no SQL Editor)
1. `fix_all_tables_rls.sql` — habilita RLS e cria policies em todas as tabelas. Sem isso, queries travam.
2. `create_configuracoes_roles.sql` — cria tabela `configuracoes` e adiciona coluna `role` em `users_perfil`.

---

## Sistema de Roles (funções de usuário)

Definidas em `src/services/configService.js` → constante `ROLES`:

| Role | Acesso |
|---|---|
| `master` | Dono do sistema — acesso total + painel Empresas |
| `admin` | Dono da empresa — acesso total ao tenant + Configurações |
| `gerente` | Vendas, Cobranças e Dashboard |
| `vendedor` | Somente Vendas |
| `financeiro` | Somente Cobranças e Dashboard |

O menu exibido no header respeita o role via `menuItems` carregado no `AuthContext`. O `RequireRole` bloqueia rotas por role.

---

## Módulo Configurações (`/configuracoes`)

Acessível para `admin` e `master`. Duas abas:

### Aba: Configurações da Empresa
- Nome da loja, WhatsApp, e-mail de contato
- Token do Mercado Pago por tenant (salvo na tabela `configuracoes`)
- Usa `upsert` com `onConflict: 'tenant_id'` — nunca dar INSERT duplicado

### Aba: Usuários e Permissões
- Lista todos os usuários do tenant com seletor de role
- Botão **+ Novo Usuário**: admin digita nome, e-mail e senha → chama `POST /api/criar-usuario`
- `api/criar-usuario.js` usa `supabase.auth.admin.createUser()` (SERVICE_ROLE) + insere em `users_perfil`
- Em caso de falha no insert do perfil, faz rollback deletando o usuário do auth

---

## Token do Mercado Pago por tenant

O token MP **não fica mais fixo no `.env`**. Fluxo:
1. `configService.getMpToken(tenantId)` busca da tabela `configuracoes`
2. Cache em memória por tenant — não bate no banco a cada link gerado
3. `invalidateMpTokenCache()` é chamado ao salvar novas configurações
4. Fallback: se não houver token no banco, usa `VITE_MP_ACCESS_TOKEN` do `.env`
5. Webhooks (Vercel e Supabase) também buscam o token do banco via `tenant_id` da cobrança

---

## Módulo Vendas (`/vendas`)

### Comportamentos importantes
- **Auto-save a cada 3s**: `triggerAutoSave()` — imperativo com `clearTimeout`/`setTimeout` (não useEffect). Timer reseta a cada digitação. Usa `isSavingRef` para evitar saves paralelos.
- **Persistência local**: estado em `localStorage` com chave `sc_vendas_${tenantId}`. Ao voltar à página, restaura sem precisar de Buscar.
- **Botão aviãozinho**: exige Data + Live preenchidos. Marca linhas com cliente como `ENVIADO`.
- **Botão Buscar**: traz só linhas sem cliente (não poluí com vendas já cobradas).
- **IDs de novas linhas**: após save, IDs retornados pelo banco são atribuídos de volta nas linhas locais (evita duplicatas).

### `safeQuery()` em `vendasService.js`
Todas as queries do `getDadosIniciais` têm timeout de 6s. Evita tela travada se alguma tabela com RLS quebrada não responder.

---

## Módulo Cobranças (`/cobrancas`)

### Filtro de status PENDENTE
Usa `.in('status', ['PENDENTE', 'ENVIADO', 'REENVIADO', 'LEMBRETE'])` — **nunca** usar `.not('status', 'in', ...)` pois causa travamento no Supabase.

### Geração de link MP (`gerarPreferenciaMp`)
- Chama `/api/mercadopago/checkout/preferences` (proxy Vercel → api.mercadopago.com)
- Token lido via `getMpToken(tenantId)` — vem do banco, não do `.env`
- `notification_url` aponta para a Edge Function do Supabase
- `external_reference` = `id` da cobrança (usado pelo webhook para dar baixa)
- `payer.name` = nome real do cliente; `payer.email` = `nomecliente@vmkids.com.br`

---

## Integração Mercado Pago

### Fluxo completo
1. Frontend gera preferência via proxy Vercel → MP retorna `init_point` (link de pagamento)
2. Cliente paga no link
3. MP chama `notification_url` (Edge Function Supabase)
4. Edge Function busca token do tenant na tabela `configuracoes`
5. Consulta pagamento na API do MP com o token correto
6. Se `status === 'approved'`, atualiza `cobrancas` com `status: 'PAGO'`

### Dois endpoints de webhook (ambos funcionando)
| URL | Onde está |
|---|---|
| `https://sellcontrol.vercel.app/api/webhook` | `api/webhook.js` (Vercel serverless) |
| `https://gtsdgkalolqzjmmwtvdv.supabase.co/functions/v1/mercadopago-webhook` | `supabase/functions/mercadopago-webhook/index.ts` (Deno) |

A `notification_url` nas preferências aponta para o **Supabase** (mais confiável).

### Deploy da Edge Function
```bash
npx supabase functions deploy mercadopago-webhook --project-ref gtsdgkalolqzjmmwtvdv --no-verify-jwt
npx supabase secrets set MP_ACCESS_TOKEN="APP_USR-..."
```

### Teste real do webhook
O simulador do painel do MP é instável — teste com pagamento real usando cartão de teste:
- Número: `5031 4332 1540 6351` | Venc: `11/30` | CVV: `123` | CPF: `12345678909`

---

## AuthContext — proteção contra travamento no F5

O `init()` do AuthContext envolve **todo** o fluxo (incluindo `getSession`) em um `Promise.race` com timeout de 6s. Garante que `setLoading(false)` é sempre chamado:

```javascript
await Promise.race([
  (async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data?.session ?? null)
    await loadProfile(data?.session?.user)
  })(),
  new Promise(resolve => setTimeout(resolve, 6000)),
])
```

---

## Proxy Vercel (`vercel.json`)

```json
{
  "rewrites": [
    { "source": "/api/mercadopago/:path*", "destination": "https://api.mercadopago.com/:path*" },
    { "source": "/((?!api/).*)", "destination": "/" }
  ]
}
```

O segundo rewrite serve `index.html` para todas as rotas React (SPA). O primeiro faz proxy do MP para evitar CORS no browser. Rotas em `/api/` são tratadas como serverless functions automaticamente pelo Vercel.

---

## Página de Recibo (`/recibo/:id`)

Página **pública** (sem autenticação). Usa `supabasePublic` (cliente sem `persistSession`) para evitar conflito de lock com o `supabase` autenticado.

---

## Onde paramos (abril/2026)

- [x] Saves automáticos de vendas (auto-save 3s + localStorage)
- [x] Botão aviãozinho exige Data + Live
- [x] Persistência de estado ao navegar entre páginas
- [x] Header redesenhado: "sellControl" estilo Bling (44px)
- [x] RLS corrigido em todas as tabelas
- [x] Webhook MP funcionando (confirmado com pagamento real)
- [x] Filtro PENDENTE corrigido (não trava mais)
- [x] Payer do MP usa nome real do cliente
- [x] Token MP por tenant (tabela `configuracoes`)
- [x] Página de Configurações: dados da empresa + token MP
- [x] Gestão de usuários: criar por login/senha, alterar roles
- [x] Sistema de roles: master, admin, gerente, vendedor, financeiro
- [x] F5 nunca trava mais (timeout 6s no auth init)

### Próximos pontos em aberto
- Dashboard com métricas reais de vendas/recebimentos
- Módulo de produção (em desenvolvimento)
- Notificação em tempo real quando cobrança é paga (Supabase Realtime)
- Painel master para criar/gerenciar empresas (`/master/empresas` já existe, expandir)
- Restrição de menu por role (hoje o menu é livre — implementar bloqueio real por role)
