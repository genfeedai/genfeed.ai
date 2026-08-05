-- The MongoDB import is complete and the previous data set has been retired.
-- Canonical Prisma IDs are now the only persisted entity identity.
DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE column_name = 'mongoId'
      AND table_schema = current_schema()
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP COLUMN %I',
      target.table_schema,
      target.table_name,
      'mongoId'
    );
  END LOOP;
END $$;
