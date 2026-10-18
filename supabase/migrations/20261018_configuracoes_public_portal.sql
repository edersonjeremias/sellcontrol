-- ============================================================
-- Acesso público às configurações não-sensíveis
-- ============================================================
-- A tabela configuracoes guarda mp_access_token e token_melhor_envio, por
-- isso anon teve o SELECT revogado (fix_configuracoes_rls_security.sql).
-- Só que o portal, o recibo público e a cotação de frete são abertos: sem
-- login a leitura falha com 42501 e o portal mostra "Portal não encontrado".
-- No navegador do lojista isso não aparecia, porque a sessão do painel é
-- authenticated e passa pela policy.
--
-- A view configuracoes_public já existia com 4 campos. Aqui ela ganha os
-- demais campos públicos de que o portal precisa. Os tokens continuam
-- fora dela.
-- ============================================================

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
  mensagem_encerramento_sacolinha
FROM configuracoes;

GRANT SELECT ON configuracoes_public TO anon, authenticated;

COMMENT ON VIEW configuracoes_public IS
  'Campos não-sensíveis de configuracoes, legíveis sem login (portal, recibo, cotação de frete). Nunca expor tokens aqui';
