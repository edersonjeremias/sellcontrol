-- ================================================================
-- CORRECAO: a conta do RH nao estava sendo criada
--
-- O indice unico de (tenant_id, origem, origem_id) foi criado com
-- WHERE origem IS NOT NULL. Indice parcial so e aceito pelo ON
-- CONFLICT se a clausula repetir o mesmo WHERE, e o upsert do
-- supabase-js manda apenas os nomes das colunas. Resultado: o banco
-- recusava com 42P10 e o lancamento do RH nao gerava conta nenhuma.
--
-- O indice passa a ser total. Nao ha risco para as contas que ja
-- existem: no Postgres, NULL e sempre distinto de NULL em indice
-- unico, entao as contas comuns (origem nula) continuam podendo
-- existir aos milhares.
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ================================================================

DROP INDEX IF EXISTS uq_contas_pagar_origem;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contas_pagar_origem
  ON contas_pagar (tenant_id, origem, origem_id);
