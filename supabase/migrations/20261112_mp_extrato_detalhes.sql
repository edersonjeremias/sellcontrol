-- ============================================================================
-- EXTRATO DO MP: forma de pagamento, parcelas e pagador de verdade
-- ============================================================================
-- Data: 12/11/2026
--
-- Três buracos na tela de extrato:
--
--   1. não dava para ver se foi cartão nem em quantas parcelas;
--   2. o pagador do PIX aparecia como "XXXXXXXXXXX" — é isso que o Mercado
--      Pago devolve em payer.email quando quem pagou não é cliente da conta.
--      O nome real vem em point_of_interaction.transaction_data.bank_info;
--   3. bruto e taxa só existiam somados, nunca por linha no resumo.
--
-- O JSON completo do pagamento já estava guardado em mp_extrato.raw, então dá
-- para preencher tudo retroativamente, sem consultar o MP de novo.
-- ============================================================================

ALTER TABLE mp_extrato
  ADD COLUMN IF NOT EXISTS tipo_pagamento TEXT,
  ADD COLUMN IF NOT EXISTS parcelas       INTEGER,
  ADD COLUMN IF NOT EXISTS valor_parcela  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cartao_final   TEXT,
  ADD COLUMN IF NOT EXISTS pagador_nome   TEXT,
  ADD COLUMN IF NOT EXISTS pagador_doc    TEXT;

COMMENT ON COLUMN mp_extrato.tipo_pagamento IS
  'payment_type_id do MP: credit_card, debit_card, bank_transfer (PIX), ticket, account_money';
COMMENT ON COLUMN mp_extrato.parcelas IS
  'Número de parcelas do cartão (1 = à vista)';
COMMENT ON COLUMN mp_extrato.valor_parcela IS
  'Valor de cada parcela, como o MP informa em transaction_details.installment_amount';
COMMENT ON COLUMN mp_extrato.cartao_final IS
  'Quatro últimos dígitos do cartão';
COMMENT ON COLUMN mp_extrato.pagador_nome IS
  'Nome de quem pagou: titular do cartão, titular da conta no PIX ou nome do payer';
COMMENT ON COLUMN mp_extrato.pagador_doc IS
  'CPF/CNPJ de quem pagou, quando o MP informa';

-- ────────────────────────────────────────────────────────────────────────────
-- Preenche a partir do JSON que já está guardado
-- ────────────────────────────────────────────────────────────────────────────
-- O MP devolve campos mascarados como "XXXXXXXXXXX". Tratar isso como texto
-- válido é pior que deixar vazio: a tela mostraria lixo como se fosse nome.
-- Serve de verdade quem tem alguma letra fora de X/x ou algum dígito.
WITH limpo AS (
  SELECT
    e.id,
    e.raw->>'payment_type_id' AS tipo,
    NULLIF(e.raw->>'installments', '')                                AS parcelas_txt,
    NULLIF(e.raw->'transaction_details'->>'installment_amount', '')   AS parcela_txt,
    e.raw->'card'->>'last_four_digits'                                AS cartao,
    e.raw->'card'->'cardholder'->>'name'                              AS nome_cartao,
    e.raw->'point_of_interaction'->'transaction_data'->'bank_info'->'payer'->>'long_name'          AS nome_pix,
    e.raw->'point_of_interaction'->'transaction_data'->'bank_info'->'payer'->>'account_holder_name' AS nome_pix2,
    NULLIF(TRIM(CONCAT_WS(' ', e.raw->'payer'->>'first_name', e.raw->'payer'->>'last_name')), '')   AS nome_payer,
    e.raw->'card'->'cardholder'->'identification'->>'number'          AS doc_cartao,
    -- No PIX o identification às vezes é objeto {number,type}, às vezes texto
    COALESCE(
      e.raw->'point_of_interaction'->'transaction_data'->'bank_info'->'payer'->'identification'->>'number',
      CASE WHEN jsonb_typeof(e.raw->'point_of_interaction'->'transaction_data'->'bank_info'->'payer'->'identification') = 'string'
           THEN e.raw->'point_of_interaction'->'transaction_data'->'bank_info'->'payer'->>'identification' END
    )                                                                 AS doc_pix,
    e.raw->'payer'->'identification'->>'number'                       AS doc_payer
  FROM mp_extrato e
  WHERE jsonb_typeof(e.raw) = 'object'
)
UPDATE mp_extrato m
   SET tipo_pagamento = l.tipo,
       parcelas       = l.parcelas_txt::int,
       valor_parcela  = l.parcela_txt::numeric,
       cartao_final   = l.cartao,
       pagador_nome   = COALESCE(
         CASE WHEN l.nome_cartao ~ '[A-WYZa-wyz0-9]' THEN l.nome_cartao END,
         CASE WHEN l.nome_pix    ~ '[A-WYZa-wyz0-9]' THEN l.nome_pix    END,
         CASE WHEN l.nome_pix2   ~ '[A-WYZa-wyz0-9]' THEN l.nome_pix2   END,
         CASE WHEN l.nome_payer  ~ '[A-WYZa-wyz0-9]' THEN l.nome_payer  END
       ),
       pagador_doc    = COALESCE(
         CASE WHEN l.doc_cartao ~ '[0-9]' THEN l.doc_cartao END,
         CASE WHEN l.doc_pix    ~ '[0-9]' THEN l.doc_pix    END,
         CASE WHEN l.doc_payer  ~ '[0-9]' THEN l.doc_payer  END
       )
  FROM limpo l
 WHERE m.id = l.id;

-- E-mail mascarado vira vazio, para a tela não mostrar "XXXXXXXXXXX"
UPDATE mp_extrato
   SET payer_email = NULL
 WHERE payer_email IS NOT NULL
   AND payer_email !~ '[A-WYZa-wyz0-9]';

CREATE INDEX IF NOT EXISTS idx_mp_extrato_tipo
  ON mp_extrato (tenant_id, tipo_pagamento);

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
