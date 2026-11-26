# Link da Bio — como colocar no ar

A página de links que vai na bio do Instagram, no lugar do Linktree. Cada
empresa tem a sua, com endereço próprio: `seusite.com/bio/<endereco>`.

---

## 1. Banco (uma vez só, por projeto Supabase)

No **Supabase → SQL Editor → New query**, abra o arquivo abaixo, copie o
conteúdo **inteiro**, cole e execute:

```
supabase/migrations/20261125c_bio_link.sql
```

Ele cria tudo de uma vez e pode ser executado de novo sem quebrar nada:

- tabela `bio_paginas` (uma página por empresa, com slug único no sistema);
- tabela `bio_links` (as redes sociais e os botões, com ordem e cliques);
- RLS por tenant: cada empresa só enxerga a própria página;
- função `bio_publica(slug)` — é ela que a página aberta chama, e devolve só o
  que a página mostra (sem `tenant_id`, sem cliques, sem o que está desligado);
- função `bio_clique(id)` — conta o clique;
- bucket `bio-imagens` (público para leitura, escrita só do próprio tenant),
  onde fica o logo.

**Conferir se deu certo:**

```sql
SELECT count(*) FROM bio_paginas;             -- deve responder 0, sem erro
SELECT bio_publica('qualquer-coisa');         -- deve responder {"encontrada": false}
SELECT id, public FROM storage.buckets WHERE id = 'bio-imagens';
```

---

## 2. Configurar (cada empresa faz a sua)

**Configurações → Link da Bio** (só admin e master).

1. **Endereço da página** — pode ser o mesmo nome da loja. É o que vira o link.
2. **Logo e nome** — envie o logo (JPG, PNG ou WEBP, até 5MB), escolha redondo
   ou quadrado e digite o nome que aparece.
3. **Aparência** — um tema pronto resolve; as cores soltas ficam logo abaixo
   para quem quiser ajustar.
4. **Redes sociais** — os ícones pequenos embaixo do nome. Para o Instagram,
   basta o nome de usuário; o endereço o sistema monta.
5. **Botões** — os links grandes. Os atalhos **Adicionar a loja online** e
   **Adicionar o WhatsApp** já vêm preenchidos com o que está em Configurações.
6. Ligue **Página no ar** e clique em **Salvar**.

O celular ao lado da tela mostra o resultado enquanto você mexe — é o mesmo
componente que desenha a página pública, então o que você vê ali é o que a
cliente vê.

---

## 3. O que já vem pronto

- **Ordem e visibilidade** — setas para subir e descer, interruptor para tirar
  um link do ar sem apagar o que já foi digitado.
- **Contagem de cliques** — aparece ao lado de cada link depois do primeiro
  toque.
- **Prévia no WhatsApp** — colar o link numa conversa mostra o logo e o nome da
  loja, não "SellControl" (`api/preview.js`).
- **Link curto** — `/b/<endereco>` abre a mesma página de `/bio/<endereco>`.
- **Botão de compartilhar** — usa o compartilhamento nativo do celular e, no
  computador, copia o link.
- **Chave Pix** — o botão do tipo Pix copia a chave em vez de tentar abrir um
  endereço.

---

## 4. Onde está cada coisa

| Arquivo | Para que serve |
| --- | --- |
| `supabase/migrations/20261125c_bio_link.sql` | Tabelas, RLS, funções e bucket |
| `src/services/bioService.js` | Leitura e gravação (painel e página aberta) |
| `src/lib/bioUrl.js` | Monta o endereço a partir do que foi digitado |
| `src/pages/configuracoes/AbaBio.jsx` | A tela de configuração |
| `src/components/bio/BioRender.jsx` | O desenho da página (público e prévia) |
| `src/components/bio/EditorLinks.jsx` | A lista de links da configuração |
| `src/components/bio/IconesBio.jsx` | Os ícones (SVG, sem fonte externa) |
| `src/pages/bio/BioPage.jsx` | A página aberta `/bio/:slug` |
| `api/preview.js` | As meta tags para o robô do WhatsApp e do Instagram (bio e peça) |
