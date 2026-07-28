-- Adiciona coluna status_pagamento na tabela vendas
-- Para rastrear se o item foi pago ou não

-- Adicionar coluna status_pagamento
ALTER TABLE vendas
ADD COLUMN IF NOT EXISTS status_pagamento TEXT;

-- Comentário explicativo
COMMENT ON COLUMN vendas.status_pagamento IS
  'Status de pagamento do item: PAGO quando a cobrança foi paga, NULL quando pendente';

-- Índice para otimizar buscas por status
CREATE INDEX IF NOT EXISTS idx_vendas_status_pagamento
  ON vendas(tenant_id, status_pagamento)
  WHERE status_pagamento IS NOT NULL;
