# Módulos por Empresa — o sistema vendido por assinatura

O sistema passa a ter um lugar só onde se decide o que cada empresa tem e
quanto paga: **Empresas → Módulos por Empresa**. Todas as páginas entram nessa
negociação, e os canais públicos (Loja, Link da Bio, Portal, Link de Frete,
Rastreio) também — quem não contratar, não abre.

---

## 1. O que aplicar, na ordem

### 1.1 Banco (obrigatório, primeiro)

No SQL Editor do Supabase, cole **o arquivo inteiro**:

```
supabase/migrations/20261126_modulos_saas.sql
```

> A migration do link da bio (`20261126_bio_mensagem_compartilhar.sql`) tem
> que ter rodado antes: esta recria a função `bio_publica` partindo da versão
> de lá. Se faltar, o SQL para com a mensagem dizendo exatamente isso e nada
> é aplicado.

Ele cria a tabela `tenant_modulos`, as funções `meus_modulos()`,
`tenant_tem_modulo()` e `canal_publico()`, e **liga para as empresas que já
existem tudo que elas já podiam usar** — ninguém perde acesso no dia da
virada. Pode rodar de novo sem quebrar nada.

### 1.2 Edge Functions (deploy)

Quatro funções passaram a conferir o contrato:

```
supabase functions deploy loja-publica
supabase functions deploy loja-checkout
supabase functions deploy frete-publico
supabase functions deploy create-tenant-admin
```

### 1.3 Variável de ambiente (opcional)

Na Vercel, para a tela de "módulo não contratado" mostrar o botão de contato:

| Variável             | Exemplo         | Para quê                                      |
|----------------------|-----------------|-----------------------------------------------|
| `VITE_SAAS_WHATSAPP` | `5547999999999` | WhatsApp de quem vende (só dígitos, com DDI)  |
| `VITE_SAAS_NOME`     | `SellControl`   | Nome do sistema (padrão: SellControl)         |

Sem a variável, a tela aparece só com o aviso, sem o botão.

---

## 2. Como usar

**Empresas → Módulos por Empresa**: escolhe a empresa, marca o que ela
contratou e ajusta o preço de cada módulo. O total mensal fecha no topo e no
pé da tela.

- **Incluso** — Dashboard e Configurações vão junto com a assinatura e não
  podem ser desligados. Sem eles o admin da empresa entra e não vê nada, nem
  para cadastrar a equipe.
- **Público** — Loja, Link da Bio, Portal, Link de Frete e Rastreio. Não são
  tela de menu: são as páginas que as clientes dela abrem, sem login.
- **Preço** — o campo começa no preço padrão do catálogo. O que você digitar
  vale só para aquela empresa. Deixar igual ao padrão faz a empresa acompanhar
  automaticamente a mudança de preço do catálogo.

Salvar faz três coisas: grava o contrato, cria ou remove as páginas da empresa
(tabela `pages`, que monta o menu) e já libera as páginas novas para quem
administra a empresa.

### Empresa nova

Começa com Dashboard e Configurações, e mais nada. Logo depois de criar, vá em
Módulos por Empresa e ligue o que foi vendido.

### Onde ficam os preços padrão

Em `src/lib/modulos.js`, campo `preco` de cada módulo. É o catálogo: a lista
de tudo que existe para vender, com nome, categoria, descrição e quem pode
abrir. Página nova no sistema é página nova aqui — e só passa a ser vendável
depois de entrar nessa lista.

---

## 3. O que acontece com quem não contratou

| Onde | O que a empresa vê |
|------|--------------------|
| Menu | o item não aparece |
| URL digitada na mão (`/compras`) | tela "não está no seu plano", com botão de contato |
| Configurações → abas Loja e Link da Bio | as abas desaparecem |
| `/loja/<slug>` | responde como loja inexistente |
| `/bio/<slug>` | responde como endereço inexistente |
| `/portal/<slug>` | responde como endereço errado |
| Link de frete (`/f/<codigo>`) | responde "link inválido ou expirado" |
| Rastreio | "rastreio não disponível" |

As travas dos canais públicos ficam no banco e nas Edge Functions, não no
navegador: saber o endereço não serve de nada.

O master do sistema (quem vende) passa por tudo, em qualquer empresa.

---

## 4. Decisões que valem conhecer

**Pedido já pago sempre é confirmado.** `loja-confirmar-pedido` ficou de fora
da trava de propósito: se a empresa sair do módulo Loja depois de uma cliente
pagar, o pedido ainda vira pedido. O dinheiro entrou.

**Pergunta sem resposta deixa passar.** Se o banco não responder se o módulo
está ligado (migration ainda não rodada, instabilidade), os canais públicos
continuam no ar e o problema fica no log. Loja fora do ar por engano custa
venda de verdade; o contrário custa, no máximo, uma loja no ar até o próximo
deploy.

**Antes da migration, o sistema funciona como antes.** O front trata "não sei
o que a empresa contratou" como "não barra nada" — é o que mantém todo mundo
trabalhando entre o deploy e a execução do SQL.

---

## 5. O que ainda não está travado

O **portal da cliente** está travado no portão de entrada: sem o módulo, a
página `/portal/<slug>` não abre e não há como chegar ao login. As funções
internas do portal (`portal_get_minha_sacolinha`, `portal_get_meus_debitos` e
as outras) ainda não conferem o módulo — uma cliente que já tenha sessão
salva no celular continuaria enxergando a própria sacolinha até a sessão
expirar. Fechar isso significa pôr a conferência dentro de cada uma dessas
funções, o que é um trabalho à parte.
