-- Adicionar campo slug para URLs personalizadas do portal
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_configuracoes_slug ON configuracoes(slug);

-- Atualizar slug da EA Second Hand (exemplo)
UPDATE configuracoes
SET slug = 'ea-second-hand'
WHERE tenant_id = '7135c82e-6155-41e5-9c42-638a94222bbe';

-- Comentário
COMMENT ON COLUMN configuracoes.slug IS 'Slug único para URL do portal do cliente (ex: sellcontrol.app/portal/ea-second-hand)';
