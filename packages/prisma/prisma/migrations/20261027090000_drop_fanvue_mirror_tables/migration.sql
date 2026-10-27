-- The four Fanvue mirror tables were never read or written by the application
-- (the Fanvue integration publishes through Credential/Post). Schema removal
-- shipped in v0.2.17. The guard aborts the migration if any table holds rows.
-- genfeed-contract-after: v0.2.17
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "fanvue_content") THEN
    RAISE EXCEPTION 'Refusing to drop "fanvue_content": it still holds rows';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "fanvue_earnings") THEN
    RAISE EXCEPTION 'Refusing to drop "fanvue_earnings": it still holds rows';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "fanvue_schedules") THEN
    RAISE EXCEPTION 'Refusing to drop "fanvue_schedules": it still holds rows';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "fanvue_subscribers") THEN
    RAISE EXCEPTION 'Refusing to drop "fanvue_subscribers": it still holds rows';
  END IF;
END
$$;

-- fanvue_schedules references fanvue_content, so it goes first.
DROP TABLE "fanvue_schedules";
DROP TABLE "fanvue_content";
DROP TABLE "fanvue_earnings";
DROP TABLE "fanvue_subscribers";
