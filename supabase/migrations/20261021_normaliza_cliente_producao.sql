-- ============================================================
-- PRODUÇÃO: cliente_nome sempre sem @ e sem espaços nas pontas
--
-- Os pedidos criados pelo portal do cliente (RPC portal_encerrar_sacolinha)
-- chegavam como '@fulana', enquanto o ManyChat e a digitação na tela gravam
-- 'fulana'. O mesmo cliente aparecia de duas formas na página de Produção.
--
-- O trigger trata na entrada, independente da origem: portal, ManyChat,
-- importação ou digitação manual.
-- Cole e execute no SQL Editor do Supabase.
-- ============================================================

CREATE OR REPLACE FUNCTION normaliza_cliente_producao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.cliente_nome := regexp_replace(TRIM(COALESCE(NEW.cliente_nome, '')), '^@+', '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normaliza_cliente_producao ON producao_pedidos;
CREATE TRIGGER trg_normaliza_cliente_producao
  BEFORE INSERT OR UPDATE OF cliente_nome ON producao_pedidos
  FOR EACH ROW
  EXECUTE FUNCTION normaliza_cliente_producao();

-- Corrige o que já está gravado (os 5 pedidos vindos do portal)
UPDATE producao_pedidos
   SET cliente_nome = regexp_replace(TRIM(cliente_nome), '^@+', '')
 WHERE cliente_nome LIKE '@%';
