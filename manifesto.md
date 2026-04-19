# SellControl — Manifesto do Projeto

> Documento para onboarding de novos desenvolvedores. Descreve o que é o sistema, onde chegamos e decisões técnicas importantes.

---

## O que é o sistema

SellControl é um sistema SaaS multi-tenant de gestão de vendas para lives no Instagram, desenvolvido para a loja VM Kids. Permite registrar vendas ao vivo, gerar cobranças com link de pagamento via Mercado Pago, e controlar recebimentos.

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
VITE_MP_ACCESS_TOKEN=...         # Token de produção do Mercado Pago
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
│   └── webhook.js              # Serverless function Vercel — recebe webhook MP
├── src/
│   ├── lib/
│   │   └── supabase.js         # Dois clientes: supabase (auth) e supabasePublic (sem sessão)
│   ├── context/
│   │   ├── AuthContext.jsx     # Sessão do usuário + profile (tenant_id)
│   │   └── AppContext.jsx      # Toast global + estado compartilhado
│   ├── components/ui/
│   │   └── AppShell.jsx        # Layout principal: header 44px + nav estilo Bling
│   ├── pages/
│   │   ├── vendas/VendasPage.jsx       # Registro de vendas ao vivo
│   │   ├── cobrancas/CobrancasPage.jsx # Gestão de cobranças + links MP
│   │   ├── recibo/ReciboPage.jsx       # Página pública do recibo (sem auth)
│   │   ├── producao/                   # Módulo de produção
│   │   └── DashboardPage.jsx
│   └── services/
│       ├── vendasService.js     # CRUD vendas + finalizarLive + getDadosIniciais
│       ├── cobrancasService.js  # CRUD cobranças + gerarPreferenciaMp + créditos
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
| `profiles` | Usuários com `tenant_id` |
| `vendas` | Linhas de venda registradas nas lives |
| `cobrancas` | Cobranças geradas por cliente/live |
| `clientes` | Cadastro de clientes (instagram + whatsapp) |
| `lives` | Lives cadastradas |
| `creditos` | Saldo de crédito por cliente |
| `listas_produtos` / `listas_modelos` / `listas_cores` / `listas_marcas` | Listas de autocomplete |

### Migration crítica
O arquivo `supabase/migrations/fix_all_tables_rls.sql` deve ser executado no SQL Editor do Supabase em qualquer ambiente novo. Ele habilita RLS e cria policies permissivas em todas as tabelas. Sem ele, todas as queries ficam travadas.

---

## Módulo Vendas (`/vendas`)

### O que faz
Tela de registro de vendas durante uma live. O usuário digita cliente, produto, preço em linhas de uma tabela.

### Comportamentos importantes
- **Auto-save a cada 3s**: implementado com `triggerAutoSave()` — função imperativa com `clearTimeout`/`setTimeout` manual (não useEffect). Isso garante que o timer reseta a cada digitação.
- **Persistência local**: estado salvo em `localStorage` com chave `sc_vendas_${tenantId}`. Ao navegar para outra página e voltar, a tela restaura exatamente o estado anterior sem precisar clicar em Buscar.
- **Botão aviãozinho (Salvar)**: exige que Data e Live estejam preenchidos. Marca as linhas que têm cliente como `status: 'ENVIADO'`. Linhas sem cliente continuam visíveis no próximo Buscar.
- **Botão Buscar**: traz linhas sem cliente (`cliente_nome` vazio ou null) para não poluir a tela com vendas já cobradas.
- **Linhas novas**: ao salvar, o ID retornado pelo banco é atribuído de volta na linha local (evita duplicatas em saves subsequentes).

### `safeQuery()` em `vendasService.js`
Todas as queries do `getDadosIniciais` são envolvidas em `safeQuery()` que faz timeout em 6s. Isso evita que a tela trave se alguma tabela com RLS quebrada não responder.

---

## Módulo Cobranças (`/cobrancas`)

### O que faz
Lista cobranças por cliente, permite enviar link de pagamento via WhatsApp, registrar baixa manual, aplicar descontos com crédito, e sincronizar com as vendas.

### Filtro de status PENDENTE
Usa `.in('status', ['PENDENTE', 'ENVIADO', 'REENVIADO', 'LEMBRETE'])` — **não** usar `.not('status', 'in', ...)` pois causa travamento no Supabase.

### Geração de link MP (`gerarPreferenciaMp`)
- Chama `/api/mercadopago/checkout/preferences` (proxy Vercel → api.mercadopago.com)
- Inclui `notification_url` apontando para a Edge Function do Supabase
- `external_reference` = `id` da cobrança na tabela `cobrancas` (usado pelo webhook para dar baixa)
- `payer.name` = nome real do cliente; `payer.email` = `nomecliente@vmkids.com.br`

---

## Integração Mercado Pago

### Fluxo completo
1. Frontend gera preferência via proxy Vercel → MP retorna `init_point` (link de pagamento)
2. Cliente paga no link
3. MP chama `notification_url` (Edge Function Supabase)
4. Edge Function consulta o pagamento na API do MP
5. Se `status === 'approved'`, atualiza `cobrancas` com `status: 'PAGO'` usando `external_reference` como ID

### Dois endpoints de webhook (ambos funcionando)
| URL | Onde está |
|---|---|
| `https://sellcontrol.vercel.app/api/webhook` | `api/webhook.js` (Vercel serverless) |
| `https://gtsdgkalolqzjmmwtvdv.supabase.co/functions/v1/mercadopago-webhook` | `supabase/functions/mercadopago-webhook/index.ts` (Deno) |

A `notification_url` nas preferências aponta para o **Supabase** (mais confiável, sem cold start longo).

### Deploy da Edge Function
```bash
npx supabase functions deploy mercadopago-webhook --project-ref gtsdgkalolqzjmmwtvdv --no-verify-jwt
npx supabase secrets set MP_ACCESS_TOKEN="APP_USR-..."
```

### Teste real do webhook
O simulador do painel do MP é instável — o teste real é fazer um pagamento com cartão de teste:
- Número: `5031 4332 1540 6351` | Venc: `11/30` | CVV: `123` | CPF: `12345678909`

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

O segundo rewrite serve o `index.html` para todas as rotas do React (SPA). O primeiro faz proxy do MP para evitar CORS no browser.

---

## Página de Recibo (`/recibo/:id`)

Página **pública** (sem autenticação). Usa `supabasePublic` (cliente sem `persistSession`) para evitar conflito de lock com o `supabase` autenticado. Exibe os itens da cobrança e o botão de pagamento MP.

---

## Onde paramos (abril/2026)

- [x] Saves automáticos de vendas funcionando (auto-save 3s + localStorage)
- [x] Botão aviãozinho exige Data + Live
- [x] Persistência de estado ao navegar entre páginas
- [x] Header redesenhado: "sellControl" estilo Bling (44px)
- [x] RLS corrigido em todas as tabelas (rodar `fix_all_tables_rls.sql`)
- [x] Webhook MP funcionando (confirmado com pagamento real)
- [x] Filtro PENDENTE corrigido (não trava mais)
- [x] Payer do MP usa nome real do cliente

### Próximos pontos em aberto
- Dashboard com métricas reais de vendas/recebimentos
- Módulo de produção (em desenvolvimento)
- Notificação em tempo real quando cobrança é paga (Supabase Realtime)
- Multi-tenant completo: painel master para gerenciar empresas (`/master`)
