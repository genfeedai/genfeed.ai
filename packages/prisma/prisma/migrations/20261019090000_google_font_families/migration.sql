-- Google font support: widen the brand font enum with the curated Google Fonts
-- the files service ships as static TTFs
-- (apps/server/files/public/assets/fonts/<key>.ttf, key = lowercase-hyphen label).
-- Additive only: existing MONTSERRAT_* rows are untouched.
ALTER TYPE "FontFamily" ADD VALUE IF NOT EXISTS 'INTER_BOLD';
ALTER TYPE "FontFamily" ADD VALUE IF NOT EXISTS 'POPPINS_BOLD';
ALTER TYPE "FontFamily" ADD VALUE IF NOT EXISTS 'BEBAS_NEUE';
ALTER TYPE "FontFamily" ADD VALUE IF NOT EXISTS 'ANTON';
ALTER TYPE "FontFamily" ADD VALUE IF NOT EXISTS 'ARCHIVO_BLACK';
ALTER TYPE "FontFamily" ADD VALUE IF NOT EXISTS 'BANGERS';
