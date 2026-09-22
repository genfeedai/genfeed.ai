-- #4869: record the confidence of the typed category decision taken at
-- discovery time so the admin registry review can show why a draft needs a
-- second look. Null on seeded rows and on deterministic keyword answers.
ALTER TABLE "models"
  ADD COLUMN "categoryConfidence" DOUBLE PRECISION;
