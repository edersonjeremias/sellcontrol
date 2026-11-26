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

### 26/11/2026 (3) — peça pendente não encerra a sacolinha sozinha

[20261126e](supabase/migrations/20261126e_encerramento_ignora_pendente.sql)
recria `encerrar_sacolinhas_vencidas`: peça com status `Pendente` sai da conta
do prazo, como já saíam `Gerar Crédito` e `Crédito gerado`. Nenhuma delas é
peça para montar, e contando o prazo por elas a rotina encerrava a sacolinha de
quem só tinha peça pendente — a Produção recebia pedido sem nada para fazer.

A regra vale **só na rotina de encerramento**. Na coluna PEÇAS, na lista que a
seta da Produção abre e no filtro "Não enviados" da Expedição a peça pendente
continua à vista: ela ainda tem que ser resolvida. Quem decide isso nas telas é
`pecaNaSacolinha` em [src/lib/statusVenda.js](src/lib/statusVenda.js), que
**não** mudou.

Efeito: cliente só com peça pendente ou com crédito nunca é encerrada sozinha;
quem tem também peça normal é encerrada pelo prazo da peça normal mais antiga.

### 26/11/2026 (2) — o valor quem decide é o servidor, e o portal é por empresa

**Dinheiro.** O link de pagamento era montado no navegador, com o preço dentro,
e a baixa só olhava se o Mercado Pago dizia "approved" — dava para pagar R$ 1
numa cobrança de R$ 300 e ela virava PAGO.

- `api/criar-preferencia-mp` reescreve o valor do item com o total da cobrança
  quando o `external_reference` aponta para uma cobrança que já existe, e
  recusa cobrança paga. Cobrança que ainda não existe (a tela de Vendas cria a
  preferência antes de gravar) segue com o valor do pedido.
- `api/dividir-pagamento` valida no servidor: as duas partes têm que fechar com
  o total, nenhuma pode ser zero, parte já paga não se redivide, e só os campos
  esperados são gravados — antes o `dados_divisao` do corpo ia direto para a
  tabela, inclusive com `status_p1: PAGO`.
- `mercadopago-webhook`, `api/confirmar-pagamento` e `loja-confirmar-pedido`
  conferem o valor pago antes de dar baixa (um centavo de folga; pagar mais
  sempre passa). PIX com desconto compara com `pix_valor` e parte dividida com
  o `valor_pN` gravado. **Pagamento a menos deixa a cobrança pendente e
  registra no log** — a baixa passa a ser manual nesse caso.
- `api/aplicar-cupom` ganhou a ação de remover cupom (ver registro anterior).

**Portal da cliente por empresa** —
[20261126b_portal_por_empresa.sql](supabase/migrations/20261126b_portal_por_empresa.sql).
A conta era identificada só pelo @: a @maria da empresa A e a @maria da empresa
B eram a mesma conta (quem cadastrasse depois trocava a senha da outra), e a
sacolinha mostrava as peças das duas lojas juntas.

- `portal_clientes`, `portal_cobrancas`, `portal_producao` e `portal_produtos`
  ganharam `tenant_id`; a unicidade virou `(tenant_id, instagram)`.
- `portal_get_tenant()` diz de qual empresa é a conta logada, e
  `portal_get_minha_sacolinha` passou a filtrar por ela. As políticas das
  tabelas legadas também.
- O e-mail da conta leva um pedaço do tenant (`maria.7135c82e@...`). O login
  tenta o endereço da empresa e depois o antigo, então **conta já criada
  continua entrando com a mesma senha**.
- `loja-publica` devolve o `tenant_id` da loja (o front precisa dele para
  montar o login), e `loja-checkout` recusa conta de portal de outra empresa.
- No painel, bloquear/desbloquear portal passou a exigir o tenant.

**As sete funções que viviam só dentro do banco** foram trazidas para
`supabase/migrations/` e ganharam o filtro por empresa —
[20261126c](supabase/migrations/20261126c_portal_debitos_por_empresa.sql)
(débitos) e
[20261126d](supabase/migrations/20261126d_portal_conversas_por_empresa.sql)
(conversas e encerramento da sacolinha). Três coisas apareceram na leitura
delas:

- `portal_criar_conversa` descobria a empresa com
  `SELECT tenant_id FROM configuracoes LIMIT 1` — a primeira linha da tabela.
  A cliente escrevia para uma loja e a mensagem caía no atendimento de outra.
- `portal_encerrar_sacolinha` confiava no `@` recebido por parâmetro: dava
  para fechar a sacolinha de outra cliente chamando a função com o @ dela.
  Agora o @ é sempre o de quem está logado.
- As funções de conversa achavam a conversa só pelo `@`, sem empresa.

Lição que ficou: **função criada direto no SQL Editor é código que ninguém
revisa**. Toda função nova entra em `supabase/migrations/`.

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
