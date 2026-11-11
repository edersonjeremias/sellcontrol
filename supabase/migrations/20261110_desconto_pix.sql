-- Desconto para quem paga no PIX
-- O percentual é da loja; o valor abatido fica guardado na cobrança porque o
-- webhook precisa dele para baixar o total quando o pagamento confirmar.

ALTER TABLE configuracoes
ADD COLUMN IF NOT EXISTS desconto_pix_percentual NUMERIC(5,2) DEFAULT 0;

ALTER TABLE cobrancas
ADD COLUMN IF NOT EXISTS pix_desconto_valor NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS pix_desconto_percentual NUMERIC(5,2);

COMMENT ON COLUMN configuracoes.desconto_pix_percentual IS
  'Desconto (%) para pagamento no PIX. 0 ou NULL desliga o desconto.';

COMMENT ON COLUMN cobrancas.pix_desconto_valor IS
  'Quanto o PIX pendente está abatendo. O webhook usa para corrigir o total ao confirmar.';

COMMENT ON COLUMN cobrancas.pix_desconto_percentual IS
  'Percentual aplicado, guardado junto para o recibo e o histórico.';

-- O recibo é público e lê pela view, não pela tabela (os tokens ficam fora dela).
-- Sem isso o cliente não enxerga o desconto antes de escolher o PIX.
CREATE OR REPLACE VIEW configuracoes_public AS
SELECT
  tenant_id,
  nome_loja,
  slug,
  link_frete,
  margem_frete,
  melhor_envio_api_url,
  endereco_cep,
  endereco_rua,
  endereco_numero,
  endereco_complemento,
  endereco_bairro,
  endereco_cidade,
  endereco_estado,
  mensagem_encerramento_sacolinha,
  desconto_pix_percentual
FROM configuracoes;

GRANT SELECT ON configuracoes_public TO anon, authenticated;
