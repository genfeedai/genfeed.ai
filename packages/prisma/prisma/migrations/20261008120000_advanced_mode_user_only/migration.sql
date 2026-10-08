-- Advanced Mode is a personal prompt-bar preference. New users start in
-- simple mode; existing personal values stay intact. Retain the unused
-- organization column while serving clients still select it; contracting it
-- requires a separately gated migration after those clients are retired.
ALTER TABLE "settings" ALTER COLUMN "isAdvancedMode" SET DEFAULT false;
