-- HeyGen Avatar 6 and Avatar 6 Turbo become routable avatar engines.
-- An organization with an explicit (non-empty) model allowlist would not see
-- them otherwise, so append both keys to every non-empty allowlist that lacks
-- them; organizations can switch either off afterwards. Empty allowlists are
-- seeded by the application and are left alone.
UPDATE "organization_settings"
SET "enabledModelIds" = "enabledModelIds" || ARRAY['heygen/heygen-avatar-6']::TEXT[]
WHERE cardinality("enabledModelIds") > 0
  AND NOT ('heygen/heygen-avatar-6' = ANY("enabledModelIds"));

UPDATE "organization_settings"
SET "enabledModelIds" = "enabledModelIds" || ARRAY['heygen/heygen-avatar-6-turbo']::TEXT[]
WHERE cardinality("enabledModelIds") > 0
  AND NOT ('heygen/heygen-avatar-6-turbo' = ANY("enabledModelIds"));
