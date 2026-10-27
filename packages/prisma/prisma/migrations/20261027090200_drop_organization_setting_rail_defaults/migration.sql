-- Org-level rail order and home app are per-member now (#7688). Schema removal
-- shipped in v0.2.17. Any stored values are obsolete and unread. Closes #7689.
-- genfeed-contract-after: v0.2.17
ALTER TABLE "organization_settings"
  DROP COLUMN "defaultRailOrder",
  DROP COLUMN "defaultHomeAppId";
