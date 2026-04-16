-- Adiciona colunas extras na tabela vendas
-- (dados históricos das planilhas: pedido, observação, data envio, rastreio)
-- Execute no Supabase: SQL Editor → New Query → Run

ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS pedido      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS observacao  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_envio  DATE,
  ADD COLUMN IF NOT EXISTS msg_lidas   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rastreio    TEXT NOT NULL DEFAULT '';
