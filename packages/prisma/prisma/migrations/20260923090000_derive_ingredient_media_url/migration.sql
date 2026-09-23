-- Media URLs are derived from the object key on every read (a Prisma result
-- field), never stored. The stored "cdnUrl" baked the CDN host into every row,
-- could not carry a short-lived signature, and mixed two kinds of data: links
-- to our own objects and links to external media.
--
-- Before dropping it, move each value to the one place its kind belongs.
-- "norm" below strips scheme, host, leading slashes and the local-disk prefix,
-- so a URL on any host (including a self-hosted CDN) reduces to its path.

-- 1. Our own objects (path under "ingredients/") become the object key.
--    Where "s3Key" already names the same object it is left alone.
UPDATE "ingredients" AS i
SET "s3Key" = k."key"
FROM (
  SELECT
    "id",
    regexp_replace(
      regexp_replace("cdnUrl", '^https?://[^/]+', ''),
      '^/+(local/)?',
      ''
    ) AS "key"
  FROM "ingredients"
  WHERE "cdnUrl" IS NOT NULL AND "cdnUrl" <> ''
) AS k
WHERE i."id" = k."id"
  AND k."key" LIKE 'ingredients/%'
  AND (
    i."s3Key" IS NULL
    OR i."s3Key" = ''
    OR regexp_replace(
      regexp_replace(i."s3Key", '^https?://[^/]+', ''),
      '^/+(local/)?',
      ''
    ) <> k."key"
  );

-- 2. External media (anything else with a scheme) moves to the metadata row's
--    "result", which the media URL resolver already falls back to. Only rows
--    without an object key of their own, and only where "result" is empty.
UPDATE "metadata" AS m
SET "result" = i."cdnUrl"
FROM "ingredients" AS i
WHERE i."metadataId" = m."id"
  AND i."cdnUrl" ~ '^https?://'
  AND regexp_replace(
    regexp_replace(i."cdnUrl", '^https?://[^/]+', ''),
    '^/+(local/)?',
    ''
  ) NOT LIKE 'ingredients/%'
  AND (i."s3Key" IS NULL OR i."s3Key" = '')
  AND m."result" = '';

ALTER TABLE "ingredients" DROP COLUMN "cdnUrl";
