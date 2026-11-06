-- Timestamp counterpart of the 20261106200000 promotion helpers. JSON keeps a
-- date as a string, so the value is copied only when it is an ISO-8601
-- timestamp with an explicit zone (a JS `Date` serialized by Prisma, or a
-- legacy `{ "$date": ... }` wrapper at a path the caller names). Anything
-- else, including a well-formed string that is not a real date, gives NULL
-- instead of failing the write that fired the trigger. The result is UTC, as
-- Prisma stores `DateTime` columns.
CREATE OR REPLACE FUNCTION "jsonb_timestamp_at"(doc JSONB, path TEXT[])
RETURNS TIMESTAMP(3)
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
  value TEXT := "jsonb_text_at"(doc, path);
BEGIN
  IF value IS NULL
    OR value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$'
  THEN
    RETURN NULL;
  END IF;
  RETURN (value::timestamptz AT TIME ZONE 'UTC');
EXCEPTION
  WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RETURN NULL;
END;
$$;
