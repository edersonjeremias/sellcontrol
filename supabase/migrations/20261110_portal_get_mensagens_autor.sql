-- ============================================================
-- portal_get_mensagens devolve quem respondeu
-- ============================================================
-- Acrescenta autor_nome ao retorno, para o portal mostrar o atendente no
-- lugar do nome fixo que havia no código. A checagem de acesso continua
-- igual: só devolve mensagens de conversa que pertence ao cliente logado.
--
-- DROP necessário porque o RETURNS TABLE ganhou uma coluna, e o Postgres
-- não troca a assinatura com CREATE OR REPLACE.
-- ============================================================

DROP FUNCTION IF EXISTS portal_get_mensagens(uuid);

CREATE FUNCTION public.portal_get_mensagens(p_conversa_id uuid)
RETURNS TABLE(
  id         uuid,
  remetente  text,
  texto      text,
  anexos     jsonb,
  created_at timestamp with time zone,
  autor_nome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_instagram TEXT;
  v_instagram_normalizado TEXT;
  v_encontrou BOOLEAN;
BEGIN
  v_instagram := portal_get_instagram();

  IF v_instagram IS NULL THEN
    RETURN;
  END IF;

  v_instagram_normalizado := REPLACE(v_instagram, '@', '');

  SELECT EXISTS(
    SELECT 1 FROM conversas
    WHERE conversas.id = p_conversa_id
    AND REPLACE(conversas.cliente_instagram, '@', '') = v_instagram_normalizado
  ) INTO v_encontrou;

  IF NOT v_encontrou THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.remetente,
    COALESCE(m.texto, '') AS texto,
    COALESCE(m.anexos, '[]'::jsonb) AS anexos,
    m.created_at,
    m.autor_nome
  FROM mensagens_contato m
  WHERE m.conversa_id = p_conversa_id
  ORDER BY m.created_at;
END;
$function$;

GRANT EXECUTE ON FUNCTION portal_get_mensagens(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
