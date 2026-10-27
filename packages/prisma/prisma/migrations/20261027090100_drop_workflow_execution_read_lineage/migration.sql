-- Execution read lineage was never written or read; the read-scope protocol it
-- belongs to has no writer. Schema removal shipped in v0.2.17. The guard aborts
-- the migration if the append-only table holds rows.
-- genfeed-contract-after: v0.2.17
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "workflow_execution_read_lineage") THEN
    RAISE EXCEPTION 'Refusing to drop "workflow_execution_read_lineage": it still holds rows';
  END IF;
END
$$;

DROP TABLE "workflow_execution_read_lineage";
