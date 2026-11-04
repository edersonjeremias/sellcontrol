# Frete e Romaneios — conciliação do dinheiro do frete

## O problema

A mesma conta do Mercado Pago recebe duas coisas diferentes:

- o **frete** que a cliente paga pelo link do romaneio;
- o **dinheiro das vendas** (cobranças, PIX, cartão).

No extrato do MP tudo vira uma lista só. Não havia como saber quanto entrou de
frete, nem como controlar a transferência desse dinheiro para a conta que gera
crédito no Melhor Envio.

## O que a página faz

Menu **Financeiro → Frete e Romaneios** (`/frete-pagamentos`), duas abas.

### Aba Romaneios

Uma linha por romaneio do período:

| Coluna | De onde vem |
| --- | --- |
| Frete | `romaneios.valor_frete` — a cotação escolhida, o que a postagem custa |
| Recebido | soma dos pagamentos **aprovados** no MP, já sem a taxa, mais o recebimento manual |
| Taxa MP | soma de `fee_details` do pagamento |
| Frete − Recebido | vermelho = faltou cobrir a postagem; verde = sobrou |
| Transferido | marcação de que o valor já foi para a conta do Melhor Envio |

Botão **Transferido** alterna linha por linha, e a seleção por checkbox marca em
lote (o rodapé mostra a soma do que está selecionado). Fica gravado quem marcou
e quando.

O cartão **A transferir** no topo é o número que interessa: quanto de frete
entrou e ainda não foi movido para a outra conta.

**Recebimento fora do PIX** (botão de lápis na linha): quando o frete entrou por
dinheiro, junto com o pagamento da venda ou abatido de crédito. Grava em
`romaneios.frete_recebido_manual`. Baixa manual (`metodo` = manual, credito,
cortesia) aparece sinalizada mas **não** entra no valor recebido — não é
dinheiro no Mercado Pago.

### Aba Extrato Mercado Pago

**Buscar no Mercado Pago** baixa os pagamentos aprovados do período e classifica
cada um:

- **frete** — o id do pagamento está em `pagamentos_frete.gateway_transaction_id`
  (o PIX que o sistema gerou para um romaneio);
- **venda** — o id está em `cobrancas.pix_payment_id`, ou o `external_reference`
  aponta para uma cobrança (inclusive pagamento dividido, `<id>-P1`);
- **outro** — não deu match; a coluna Origem permite classificar à mão, e a
  escolha manual não é desfeita na próxima busca.

Depois da primeira busca, **Filtrar** só lê o que já está espelhado em
`mp_extrato` — não bate no Mercado Pago de novo.

O token do MP nunca vai para o navegador: a busca passa por
`api/mp-extrato.js`, que roda no servidor com service role, confere o JWT de
quem chamou e só aceita o tenant do próprio usuário (master pode consultar
qualquer um).

## Estrutura no banco

Migration: `supabase/migrations/20261104_conciliacao_frete.sql`

- `romaneios`: `frete_transferido`, `frete_transferido_em`,
  `frete_transferido_por`, `frete_transferido_por_nome`,
  `frete_recebido_manual`, `frete_recebido_obs`
- `pagamentos_frete`: `mp_taxa`, `valor_liquido` (preenchidos retroativamente a
  partir do `gateway_response` que já estava gravado)
- `mp_extrato`: espelho do extrato do MP, com `origem` (frete/venda/outro),
  `origem_auto` e `romaneio_id`
- `pages`: entrada `frete-pagamentos` na categoria Financeiro

## Para colocar no ar

1. **SQL** — rodar `supabase/migrations/20261104_conciliacao_frete.sql` no SQL
   Editor do Supabase.
2. **Deploy do front e da API** — automático no push (Vercel).
3. **Edge Functions** (opcional, melhora o dado novo) — os webhooks passaram a
   gravar `mp_taxa` e `valor_liquido` na hora que o pagamento é aprovado:

   ```
   supabase functions deploy mercadopago-webhook
   supabase functions deploy webhook-mercadopago-frete
   ```

   Sem esse deploy nada quebra: o botão **Buscar no Mercado Pago** preenche taxa
   e líquido dos pagamentos de frete que encontrar.
4. **Permissão** — em `/admin`, liberar a página *Frete e Romaneios* para quem
   precisa (master já vê tudo).

## Limites conhecidos

- A busca de pagamentos do MP devolve no máximo ~1000 registros por consulta.
  Passando disso, a tela avisa e é preciso consultar em intervalos menores.
- O período da aba Romaneios filtra pela **data de criação do romaneio**, não
  pela data do pagamento. Para caçar pendências antigas, abra um período largo e
  use Situação = *A transferir*.
- O valor líquido depende do que o MP informa em `net_received_amount`. Enquanto
  não houver essa informação, o líquido mostrado é igual ao bruto.
