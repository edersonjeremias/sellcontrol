-- Contador de uso dos cupons via trigger no banco
-- Motivo: o notification_url do Mercado Pago aponta para a Edge Function
-- mercadopago-webhook, que marcava a cobranca como PAGO sem incrementar o
-- cupom. Com o trigger, qualquer caminho que mude o status (Edge Function,
-- API do Vercel, baixa manual, SQL) passa a contar corretamente.

-- 1. Funcao do trigger
CREATE OR REPLACE FUNCTION public.trg_cupom_uso()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  era_pago   BOOLEAN := COALESCE(OLD.status, '') IN ('PAGO', 'BAIXADO');
  virou_pago BOOLEAN := COALESCE(NEW.status, '') IN ('PAGO', 'BAIXADO');
BEGIN
  -- passou a ser pago: consome uma vaga do cupom
  IF NOT era_pago AND virou_pago AND NEW.cupom_id IS NOT NULL THEN
    UPDATE cupons
       SET usos_realizados = COALESCE(usos_realizados, 0) + 1
     WHERE id = NEW.cupom_id;
  END IF;

  -- deixou de ser pago (cancelamento/estorno): devolve a vaga
  IF era_pago AND NOT virou_pago AND OLD.cupom_id IS NOT NULL THEN
    UPDATE cupons
       SET usos_realizados = GREATEST(COALESCE(usos_realizados, 0) - 1, 0)
     WHERE id = OLD.cupom_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Liga o trigger na tabela de cobrancas
DROP TRIGGER IF EXISTS cobrancas_cupom_uso ON cobrancas;
CREATE TRIGGER cobrancas_cupom_uso
AFTER UPDATE OF status ON cobrancas
FOR EACH ROW
EXECUTE FUNCTION public.trg_cupom_uso();

-- 3. Preenche cupom_id onde faltou (cobrancas antigas)
UPDATE cobrancas cob
   SET cupom_id = cup.id
  FROM cupons cup
 WHERE cob.cupom_codigo IS NOT NULL
   AND cob.cupom_id IS NULL
   AND cup.codigo = cob.cupom_codigo
   AND cup.tenant_id = cob.tenant_id;

-- 4. Recalcula o contador de todos os cupons
UPDATE cupons c
   SET usos_realizados = x.total
  FROM (
    SELECT cup.id, COUNT(cob.id) AS total
      FROM cupons cup
      LEFT JOIN cobrancas cob
        ON cob.cupom_id = cup.id
       AND cob.status IN ('PAGO', 'BAIXADO')
     GROUP BY cup.id
  ) x
 WHERE c.id = x.id;
