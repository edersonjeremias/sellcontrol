-- Adiciona campos para integração com Melhor Envio
ALTER TABLE romaneios
ADD COLUMN IF NOT EXISTS melhor_envio_cotacao_id TEXT,
ADD COLUMN IF NOT EXISTS melhor_envio_order_id TEXT,
ADD COLUMN IF NOT EXISTS codigo_rastreio TEXT,
ADD COLUMN IF NOT EXISTS url_rastreio TEXT;

COMMENT ON COLUMN romaneios.melhor_envio_cotacao_id IS 'ID da cotação escolhida no Melhor Envio';
COMMENT ON COLUMN romaneios.melhor_envio_order_id IS 'ID do pedido criado no Melhor Envio';
COMMENT ON COLUMN romaneios.codigo_rastreio IS 'Código de rastreamento dos Correios/transportadora';
COMMENT ON COLUMN romaneios.url_rastreio IS 'URL para rastreamento';
