-- ============================================================================
-- FUNDIR CADASTRO DUPLICADO DA LOJA NO @ DE VERDADE
-- ============================================================================
-- A primeira compra pela loja criou um cadastro `loja.<whatsapp>` ao lado do
-- que a cliente já tinha. As peças dela ficaram nesse cadastro novo, e por
-- isso não aparecem no portal, que mostra o que está no @ dela.
--
-- A partir de 22/11/2026 o sistema casa pelo WhatsApp e isso não acontece
-- mais. Este arquivo é para arrumar o que já ficou para trás.
--
-- COMO USAR: troque os dois valores no BLOCO 2 e rode um bloco por vez.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- BLOCO 1 — QUEM ESTÁ DUPLICADO (rode e olhe antes de mexer)
-- ────────────────────────────────────────────────────────────────────────────
-- Mostra os cadastros criados pela loja ao lado de um @ com o mesmo WhatsApp.
SELECT
  loja.instagram                      AS cadastro_da_loja,
  outro.instagram                     AS cadastro_de_verdade,
  outro.nome_completo,
  loja.whatsapp,
  (SELECT count(*) FROM vendas v
    WHERE v.tenant_id = loja.tenant_id
      AND lower(btrim(v.cliente_nome)) = lower(btrim(loja.instagram)))  AS pecas_na_loja,
  EXISTS (SELECT 1 FROM portal_clientes pc
           WHERE lower(pc.instagram) = lower(replace(outro.instagram, '@', ''))) AS outro_usa_portal
FROM clientes loja
JOIN clientes outro
  ON outro.tenant_id = loja.tenant_id
 AND outro.id <> loja.id
 AND outro.instagram NOT LIKE 'loja.%'
 AND right(regexp_replace(coalesce(outro.whatsapp, ''), '\D', '', 'g'), 11)
   = right(regexp_replace(coalesce(loja.whatsapp, ''), '\D', '', 'g'), 11)
 AND length(regexp_replace(coalesce(loja.whatsapp, ''), '\D', '', 'g')) >= 10
WHERE loja.instagram LIKE 'loja.%'
ORDER BY loja.created_at DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- BLOCO 2 — FUNDIR: leva tudo do cadastro da loja para o @ de verdade
-- ────────────────────────────────────────────────────────────────────────────
-- Troque os dois valores abaixo pelos que o BLOCO 1 mostrou.
DO $$
DECLARE
  v_tenant  uuid := '7135c82e-6155-41e5-9c42-638a94222bbe';
  v_de      text := 'loja.11975377492';   -- cadastro criado pela loja
  v_para    text := 'edersonjeremias';    -- @ que a cliente usa no portal
  v_movidas integer;
BEGIN
  -- As peças: é isso que faz a compra aparecer no portal dela
  UPDATE vendas
     SET cliente_nome = v_para
   WHERE tenant_id = v_tenant
     AND lower(btrim(cliente_nome)) = lower(btrim(v_de));
  GET DIAGNOSTICS v_movidas = ROW_COUNT;
  RAISE NOTICE 'Peças movidas: %', v_movidas;

  -- O romaneio e o endereço de entrega daquele pedido
  UPDATE romaneios
     SET cliente_instagram = v_para
   WHERE tenant_id = v_tenant
     AND lower(btrim(cliente_instagram)) = lower(btrim(v_de));

  UPDATE enderecos_clientes
     SET cliente_instagram = v_para
   WHERE tenant_id = v_tenant
     AND lower(btrim(cliente_instagram)) = lower(btrim(v_de));

  -- Produção, quando a instalação tiver essa tabela
  IF to_regclass('public.producao_pedidos') IS NOT NULL THEN
    EXECUTE format(
      'UPDATE producao_pedidos SET cliente_nome = %L
        WHERE lower(btrim(coalesce(cliente_nome, %L))) = lower(btrim(%L))',
      v_para, '', v_de
    );
  END IF;

  -- Pedidos da loja, para o histórico apontar para o cadastro certo
  UPDATE loja_pedidos
     SET cliente_instagram = v_para
   WHERE tenant_id = v_tenant
     AND lower(btrim(coalesce(cliente_instagram, ''))) = lower(btrim(v_de));

  -- O cadastro da loja perde a razão de existir. Completa o @ de verdade com
  -- o que só a loja tinha (CPF, e-mail) e some com o duplicado.
  UPDATE clientes destino
     SET cpf   = coalesce(nullif(btrim(destino.cpf), ''),   origem.cpf),
         email = coalesce(nullif(btrim(destino.email), ''), origem.email)
    FROM clientes origem
   WHERE destino.tenant_id = v_tenant
     AND lower(btrim(destino.instagram)) = lower(btrim(v_para))
     AND origem.tenant_id = v_tenant
     AND lower(btrim(origem.instagram)) = lower(btrim(v_de));

  DELETE FROM clientes
   WHERE tenant_id = v_tenant
     AND lower(btrim(instagram)) = lower(btrim(v_de));

  RAISE NOTICE 'Cadastro % fundido em %', v_de, v_para;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- BLOCO 3 — CONFERÊNCIA: as peças da loja agora estão no @ certo
-- ────────────────────────────────────────────────────────────────────────────
SELECT cliente_nome, codigo, produto, modelo, cor, preco, numero_pedido, origem, data_live
  FROM vendas
 WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe'
   AND origem = 'loja'
 ORDER BY created_at DESC;
