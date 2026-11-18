-- Live agent reply streaming is on by default (#9884).
--
-- Only the column default changes, which is a catalog update with no table
-- rewrite. The existing singleton platform_settings row keeps the value it
-- already holds; an operator turns streaming on for that row in
-- Admin > Settings. No data is written here.

ALTER TABLE "platform_settings"
  ALTER COLUMN "isAgentTokenStreamingEnabled" SET DEFAULT true;
