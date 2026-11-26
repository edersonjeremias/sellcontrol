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
