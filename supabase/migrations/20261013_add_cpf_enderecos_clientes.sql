-- CPF do destinatário, exigido pelo Melhor Envio na emissão da etiqueta.
-- O portal já pedia o campo no formulário, mas não havia onde gravá-lo.
-- Armazenado somente com dígitos; a máscara é aplicada na exibição.

ALTER TABLE enderecos_clientes
ADD COLUMN IF NOT EXISTS cpf TEXT;

COMMENT ON COLUMN enderecos_clientes.cpf IS
  'CPF do destinatário, apenas dígitos. Enviado como document na criação do pedido no Melhor Envio';
