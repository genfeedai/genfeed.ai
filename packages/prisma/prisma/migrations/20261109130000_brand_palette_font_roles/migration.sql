-- Brand kit: named palette and font roles (#9708, #9709)
ALTER TABLE "brands" ADD COLUMN "colorPalette" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "brands" ADD COLUMN "fontRoles" JSONB NOT NULL DEFAULT '{}';
