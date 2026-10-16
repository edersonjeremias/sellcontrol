-- E-mail do destinatário, exigido pelo Melhor Envio junto com o CPF na
-- emissão da etiqueta. Até agora ia um 'cliente@email.com' fixo no pedido.
-- O CPF já tinha coluna própria (20261013_add_cpf_enderecos_clientes.sql).

ALTER TABLE enderecos_clientes
ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN enderecos_clientes.email IS
  'E-mail do destinatário. Enviado na criação do pedido no Melhor Envio';
