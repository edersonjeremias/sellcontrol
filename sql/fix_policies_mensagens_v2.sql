-- ════════════════════════════════════════════════════════════════
-- FIX URGENTE: Remove policies que bloquearam tudo
-- ════════════════════════════════════════════════════════════════

-- 1. Remove todas as policies de mensagens_contato
DROP POLICY IF EXISTS mensagens_admin ON mensagens_contato;
DROP POLICY IF EXISTS mensagens_portal ON mensagens_contato;

-- 2. DESABILITA RLS temporariamente para mensagens_contato
ALTER TABLE mensagens_contato DISABLE ROW LEVEL SECURITY;

-- 3. Remove policies de conversas também
DROP POLICY IF EXISTS conversas_admin ON conversas;
DROP POLICY IF EXISTS conversas_portal ON conversas;

-- 4. DESABILITA RLS para conversas
ALTER TABLE conversas DISABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- DONE! Execute AGORA e atualize as páginas
-- ══════════════════════════════════════════════════════════════════
