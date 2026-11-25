-- Text alternative of an image. Instagram receives it as alt_text when the
-- image is published. Nullable and unset for every existing row.
ALTER TABLE "ingredients" ADD COLUMN "altText" TEXT;
