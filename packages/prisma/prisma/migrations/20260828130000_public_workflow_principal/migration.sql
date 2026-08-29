-- Public free tools execute through the same tenant-bound workflow engine as
-- authenticated surfaces. This non-login principal owns those hidden runs and
-- their draft outputs; it is never a Member and cannot authenticate.
INSERT INTO "users" ("id", "handle", "name", "updatedAt")
VALUES (
  'genfeed-public-tools',
  'genfeed-public-tools',
  'Genfeed Public Tools',
  now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "organizations" ("id", "userId", "label", "slug", "updatedAt")
VALUES (
  'genfeed-public-tools',
  'genfeed-public-tools',
  'Genfeed Public Tools',
  'genfeed-public-tools',
  now()
)
ON CONFLICT ("id") DO NOTHING;
