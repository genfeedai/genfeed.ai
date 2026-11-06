-- Shared helpers for the triggers that copy hot JSONB keys into real columns
-- (#9359). Each returns a value only when the JSON at `path` has the type the
-- old JSON path filter matched, so a promoted column keeps that filter's
-- semantics: Prisma's `{ path, equals: 'x' }` never matched a number, and
-- `{ path, equals: true }` never matched the string "true".
--
-- IMMUTABLE so they can back expression indexes as well as triggers.

CREATE OR REPLACE FUNCTION "jsonb_text_at"(doc JSONB, path TEXT[])
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE WHEN jsonb_typeof(doc #> path) = 'string' THEN doc #>> path END
$$;

CREATE OR REPLACE FUNCTION "jsonb_number_at"(doc JSONB, path TEXT[])
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(doc #> path) = 'number' THEN (doc #>> path)::double precision
  END
$$;

CREATE OR REPLACE FUNCTION "jsonb_true_at"(doc JSONB, path TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(doc #> path = 'true'::jsonb, false)
$$;
