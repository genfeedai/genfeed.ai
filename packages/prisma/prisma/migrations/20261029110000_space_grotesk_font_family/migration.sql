-- Space Grotesk Bold for brand captions and thumbnails. Same pattern as
-- 20261019090000_google_font_families: the files service ships the static TTF
-- (apps/server/files/public/assets/fonts/space-grotesk-bold.ttf).
-- Additive only.
ALTER TYPE "FontFamily" ADD VALUE IF NOT EXISTS 'SPACE_GROTESK_BOLD';
