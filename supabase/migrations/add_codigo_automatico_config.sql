-- Adiciona configuração de código automático de peças
-- Esta migration permite que cada empresa configure se quer código manual ou automático

-- 1. Adiciona coluna para ativar/desativar código automático
ALTER TABLE configuracoes
ADD COLUMN IF NOT EXISTS codigo_automatico boolean DEFAULT false;

-- 2. Adiciona coluna para controlar o próximo código (começa em 100)
ALTER TABLE configuracoes
ADD COLUMN IF NOT EXISTS proximo_codigo integer DEFAULT 100;

-- 3. Comentários para documentação
COMMENT ON COLUMN configuracoes.codigo_automatico IS
  'Se true, o sistema gera códigos automáticos começando do proximo_codigo. Se false, o usuário digita manualmente.';

COMMENT ON COLUMN configuracoes.proximo_codigo IS
  'Próximo código a ser usado quando codigo_automatico=true. Incrementa automaticamente após cada venda.';
