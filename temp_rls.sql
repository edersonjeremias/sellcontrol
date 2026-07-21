ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pages_select_policy ON pages;
DROP POLICY IF EXISTS pages_insert_policy ON pages;
DROP POLICY IF EXISTS pages_update_policy ON pages;
DROP POLICY IF EXISTS pages_delete_policy ON pages;