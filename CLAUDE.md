# SellControl — regras para quem mexe no código

Sistema SaaS multi-tenant de vendas em live. Vendido por assinatura mensal:
cada empresa paga pelo que tem habilitado.

Arquitetura e padrões de código: [gemini.md](gemini.md).
Visual e comportamento de UI (dark mode, zero scrollbar, sem `alert()`):
[Manifesto de Design.md](Manifesto%20de%20Design.md).
Histórico e decisões: [manifesto.md](manifesto.md).

---

## REGRA Nº 1 — página ou recurso novo entra no catálogo de módulos

**Nada novo no sistema fica fora de Empresas → Módulos por Empresa.** Toda
página é negociável e todo canal público (loja, link da bio, portal, link de
frete, rastreio) é vendável. Se não estiver no catálogo, não dá para cobrar
por ele e todas as empresas o recebem de graça.

Ao criar **qualquer** página nova, módulo novo ou canal público novo, antes de
considerar o trabalho pronto:

### 1. Entre no catálogo — [src/lib/modulos.js](src/lib/modulos.js)

Uma linha no array `MODULOS`, com `slug`, `label`, `categoria`, `tipo`
(`pagina` ou `recurso`), `icon`, `order_index`, `preco` (mensalidade padrão
sugerida), `roles` (cargos que podem abrir, ou `null`), `essencial` (quase
sempre `false`) e `descricao` (uma linha, que o master lê na hora de vender).

Este arquivo é a **fonte única**. Não crie uma segunda lista de páginas em
nenhum serviço ou componente — já existiu uma em `authService.js` e as duas
viviam divergindo.

### 2. Proteja a rota — [src/App.jsx](src/App.jsx)

- Tela normal: `<RequirePage slug="meu-slug">`. Ela checa, nessa ordem,
  o módulo da empresa, o cargo (campo `roles` do catálogo) e a permissão por
  usuário (`pages_access`).
- Tela que é de todo mundo da empresa quando o módulo existe (quiosque de
  ponto, por exemplo): `<RequireModulo slug="meu-slug">`.
- `RequireRole` sozinho é só para as telas do dono do SaaS (`/admin`,
  `/master/empresas`). Usar nas outras deixa a página fora da negociação.

### 3. Canal público trava no banco, nunca no front

Página que abre sem login (`/loja/...`, `/bio/...`, `/portal/...`,
`/f/<codigo>`, rastreio) tem que conferir o contrato onde o visitante não
alcança:

- Edge Function ou rota em `api/`: `supabase.rpc('tenant_tem_modulo', { p_tenant_id, p_slug })`.
- Função SQL `SECURITY DEFINER`: `IF NOT tenant_tem_modulo(v_tenant_id, 'slug')`.
- Canal que abre por slug de empresa: `canal_publico(p_slug, p_canal)` resolve
  e só responde se o módulo estiver ligado.

Erro ao consultar o módulo **deixa passar e registra no log**: loja fora do ar
por engano custa venda de verdade. E operação de dinheiro que já aconteceu
(confirmar pedido pago) nunca é travada.

### 4. Abas e atalhos escondem o que não foi contratado

Em componente, use `const { temModulo } = useAuth()` e esconda a aba, o botão
ou o atalho. Exemplo: as abas Loja e Link da Bio em Configurações.

Detalhes, decisões e o que ainda falta:
[INSTRUCOES_MODULOS_SAAS.md](INSTRUCOES_MODULOS_SAAS.md).

---

## Multi-empresa e segredos

O sistema tem mais de uma empresa dentro do mesmo banco. Três regras que valem
para qualquer código novo:

1. **`tenant_id` é obrigatório, nunca tem padrão.** Não escreva
   `tenantId || import.meta.env.VITE_TENANT_ID`. Esse fallback existe em
   serviços antigos e faz uma chamada sem tenant gravar na empresa do Ederson
   sem dar erro. Em código novo, falte o tenant, estoure.
2. **Credencial de empresa não cai em variável de ambiente.** Token do Mercado
   Pago, token do Melhor Envio e afins vêm de `configuracoes` daquele
   `tenant_id`. Sem token configurado, o certo é erro com mensagem clara —
   cair no token do ambiente é cobrar na conta de outra empresa.
3. **Quem usa `SUPABASE_SERVICE_ROLE_KEY` valida o chamador.** Service role
   ignora RLS. Em rota de `api/` ou Edge Function, confira o
   `Authorization` com `supabase.auth.getUser()` e cheque `tenant_id`/role no
   `users_perfil` antes de agir (modelo: `api/mp-extrato.js`), ou use um
   segredo **por empresa**, guardado no banco (modelo:
   `supabase/functions/receber-solicitacao-envio`). E segredo nenhum mora em
   `src/` — tudo em `src/` vai inteiro para o navegador.

## Banco de dados

- Mudança de schema vai em `supabase/migrations/<AAAAMMDD>_<assunto>.sql`,
  **idempotente** (`IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT`), para
  poder rodar de novo sem quebrar nada.
- Toda tabela nova tem `tenant_id` e RLS por tenant.
- Entregue o SQL como **arquivo inteiro colável**, nunca como trecho solto de
  dentro de um bloco.
- Ao recriar uma função que já existe (`CREATE OR REPLACE`), parta da versão
  mais recente nas migrations — não da que está na sua memória. Já aconteceu
  de uma recriação apagar um campo que outra migration tinha acabado de somar.

## Rotina de trabalho

- Lógica de banco em `src/services/`, nunca `supabase` direto na página.
- Build local quebrado não significa Vercel quebrada: confira antes de alarmar.
- Ao final de cada tarefa, commit e push para `main` — a Vercel publica sozinha.
- Mensagem de commit em português, sem emoji, dizendo o efeito para quem usa.
- **Toda alteração entra no registro abaixo**, na mesma tarefa em que foi
  feita: página ou módulo novo, mudança de regra, migration, correção que muda
  comportamento. Uma linha, com data. Quem abre o projeto amanhã lê daqui.

---

## Registro de alterações

Mais recente em cima. Página nova também entra no catálogo (Regra nº 1).

### 26/11/2026 — nada mais é fixo na empresa do dono

- `tenant_id` passou a ser obrigatório: `src/lib/tenant.js` (`exigirTenant`)
  substituiu o `tenantId || VITE_TENANT_ID` nos 12 serviços que o tinham.
  Falta de tenant agora é erro na tela, não gravação na empresa errada.
- Cobranças: as 3 chamadas de `gerarPreferenciaMp` em `CobrancasPage` não
  passavam o tenant e caíam no fallback. Agora passam.
- `AppContext` perdeu `lives`, `bloqueados` e `carregarDados` — ninguém
  consumia, e era a única leitura do sistema sem dizer de qual empresa.
- Token do Mercado Pago: fim do fallback para o token do ambiente em
  `api/criar-preferencia-mp`, `api/confirmar-pagamento`, `api/mp-extrato` e no
  `mercadopago-webhook`. Empresa sem token configurado recebe erro claro em
  vez de cobrar na conta de outra. `configService.getMpToken` (sem uso) saiu.
- Rotas de `api/` com service role passaram a conferir quem chamou, via
  `api/_auth.js` (`exigirUsuario`) e `src/lib/apiInterna.js` no front:
  `criar-usuario` (admin só cria na própria empresa e não cria master),
  `reset-senha-usuario` (só gente da mesma empresa, e senha de master só
  master troca), `portal-cliente` (exige login e cliente cadastrada na
  empresa de quem chamou).
- `api/run-migration.js` e `api/portal-migrar.js` **apagados**: rodavam DDL com
  um segredo escrito no front. Junto saíram os botões da tela de Clientes; o
  banner agora manda colar o SQL no Supabase.
- `api/aplicar-cupom` passou a validar o cupom e **calcular o total no
  servidor** — antes gravava o `total` que viesse no corpo, então quem tinha o
  link do recibo zerava a própria dívida. Remover cupom virou ação dessa mesma
  rota e volta a gravar o valor cheio (antes o update saía do navegador, a RLS
  anônima só lê, e o total descontado ficava no banco).
- `receber-pedido-live` (ManyChat): o segredo fixo no código saiu; agora usa o
  `manychat_webhook_token` de cada empresa, como `receber-solicitacao-envio`, e
  a busca da peça filtra por `tenant_id` — sem isso o comentário de uma live
  podia marcar peça de outra empresa. **Exige configurar o token em
  Configurações → Integrações e no header do fluxo do ManyChat.**
- Nome da VM Kids saiu do produto: e-mail do pagador do MP, `'VM KIDS'` na
  impressão de pedidos e no rastreio, `package.json`. O domínio do e-mail da
  conta do portal virou configurável (`VITE_PORTAL_EMAIL_DOMINIO` /
  `PORTAL_EMAIL_DOMINIO`), mas **o padrão continua o antigo**: trocar o valor
  invalida os logins de portal já criados.

### 25/11/2026 — módulos por empresa

- Sistema passou a ser vendido por módulo: catálogo em `src/lib/modulos.js`,
  contrato e preço em `tenant_modulos`, tela em Empresas → Módulos por Empresa,
  travas dos canais públicos no banco. Ver
  [INSTRUCOES_MODULOS_SAAS.md](INSTRUCOES_MODULOS_SAAS.md).
- Link da bio (`/bio/<slug>`) entrou como canal público vendável.
