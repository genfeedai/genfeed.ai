-- Media URLs are derived from the object key on every read (a Prisma result
-- field), never stored. A stored URL baked the CDN host into every row and
-- could not carry a short-lived signature.
--
-- Preserve exactly what each row served before dropping the column. The old
-- resolver preferred "cdnUrl" over "s3Key", so where "cdnUrl" names a
-- different object than "s3Key" (or "s3Key" is empty) carry it into "s3Key"
-- verbatim; the resolver accepts a full URL there, including external media.
-- Where "cdnUrl" merely spells out "s3Key" on a host, keep the clean key so
-- the row no longer depends on the CDN host.
UPDATE "ingredients"
SET "s3Key" = "cdnUrl"
WHERE "cdnUrl" IS NOT NULL
  AND "cdnUrl" <> ''
  AND (
    "s3Key" IS NULL
    OR "s3Key" = ''
    OR position(ltrim("s3Key", '/') IN "cdnUrl") = 0
  );

ALTER TABLE "ingredients" DROP COLUMN "cdnUrl";
