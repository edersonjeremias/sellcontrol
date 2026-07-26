-- Permitir acesso público (anon) ao nome_loja da tabela configuracoes
-- Necessário para que o recibo mostre o nome da empresa sem login

-- Policy para SELECT público
DROP POLICY IF EXISTS "configuracoes_nome_loja_public" ON configuracoes;

CREATE POLICY "configuracoes_nome_loja_public"
ON configuracoes
FOR SELECT
TO anon, authenticated
USING (true);

-- Comentário
COMMENT ON POLICY "configuracoes_nome_loja_public" ON configuracoes IS
  'Permite usuários anônimos (recibo público) lerem nome da loja';
