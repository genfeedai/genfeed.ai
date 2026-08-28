-- Public free tools execute through the same tenant-bound workflow engine as
-- authenticated surfaces. This non-login principal owns those hidden runs and
-- their draft outputs; it is never a Member and cannot authenticate.
INSERT INTO "users" ("id", "handle", "name")
VALUES (
  'genfeed-public-tools',
  'genfeed-public-tools',
  'Genfeed Public Tools'
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "organizations" ("id", "userId", "label", "slug")
VALUES (
  'genfeed-public-tools',
  'genfeed-public-tools',
  'Genfeed Public Tools',
  'genfeed-public-tools'
)
ON CONFLICT ("id") DO NOTHING;
