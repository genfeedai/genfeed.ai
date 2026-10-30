-- #8695: a brand can keep a second and third mark for other backgrounds
-- (a dark mark for light footage, a red mark for livestreams). NULL falls back
-- to watermarkLogoId.
ALTER TABLE "brands"
  ADD COLUMN "watermarkLightLogoId" TEXT,
  ADD COLUMN "watermarkLiveLogoId" TEXT;
