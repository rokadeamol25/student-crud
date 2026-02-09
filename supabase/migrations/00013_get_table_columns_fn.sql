-- Creates a reusable function to list column names for any public table.
-- Called via supabase.rpc('get_table_columns', { tbl: 'products' })
CREATE OR REPLACE FUNCTION get_table_columns(tbl text)
RETURNS TABLE(column_name text) AS $$
BEGIN
  RETURN QUERY
  SELECT c.column_name::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = tbl
  ORDER BY c.ordinal_position;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
