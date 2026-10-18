-- PIX direto no recibo: guarda o QR Code gerado para a cobrança
-- O cliente paga sem sair da página /recibo/:id

ALTER TABLE cobrancas
ADD COLUMN IF NOT EXISTS pix_qr_code TEXT,
ADD COLUMN IF NOT EXISTS pix_qr_code_base64 TEXT,
ADD COLUMN IF NOT EXISTS pix_expiracao TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pix_payment_id TEXT,
ADD COLUMN IF NOT EXISTS pix_valor NUMERIC(10,2);

COMMENT ON COLUMN cobrancas.pix_qr_code IS
  'Código copia e cola do PIX pendente';

COMMENT ON COLUMN cobrancas.pix_qr_code_base64 IS
  'Imagem PNG do QR Code em base64';

COMMENT ON COLUMN cobrancas.pix_expiracao IS
  'Quando o PIX pendente deixa de valer. Passou disso, o recibo gera outro.';

COMMENT ON COLUMN cobrancas.pix_payment_id IS
  'ID do pagamento PIX no Mercado Pago';

COMMENT ON COLUMN cobrancas.pix_valor IS
  'Valor que o PIX pendente cobra. Se o total mudar (cupom), o recibo gera outro.';
