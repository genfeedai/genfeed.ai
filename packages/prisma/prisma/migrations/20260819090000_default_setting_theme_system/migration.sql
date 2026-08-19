-- New accounts follow the host appearance by default. Existing explicit
-- light/dark preferences remain unchanged.
ALTER TABLE "settings" ALTER COLUMN "theme" SET DEFAULT 'system';
