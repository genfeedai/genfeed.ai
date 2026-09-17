-- #4834: `Model.isDeprecated` and `Model.deprecatedAt` restated facts the row
-- already carried, so the registry held one truth in three columns.
--
-- `isDeprecated` was only ever written as `isLegacy OR lifecycle = 'RETIRED'`
-- (ModelsService.createModel and transitionLifecycle), so every read site can
-- spell it from columns that remain. Both readers now do:
--   * the model selector's Legacy pill, which already OR-ed all three
--   * the catalog seed's operator-demotion guard
-- `lifecycle` and `isLegacy` both stay in the serializer allowlist, so an API
-- client loses no information it cannot derive.
--
-- `deprecatedAt` was write-only: nothing in the repository ever read its value.
--
-- No backfill is required. Neither column is read after this migration, and
-- the surviving columns are already authoritative — the 20260901120000
-- migration backfilled `isDeprecated` from `lifecycle`, so it carries nothing
-- the pair cannot reproduce.
ALTER TABLE "models" DROP COLUMN "isDeprecated";
ALTER TABLE "models" DROP COLUMN "deprecatedAt";
