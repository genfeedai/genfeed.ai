-- HeyGen Avatar IV and Avatar V become the routable avatar engines (#6624).
-- Avatar renders were never allowlist-gated before, so an organization with an
-- explicit (non-empty) model allowlist would lose avatar generation the moment
-- routing honours it. Append both keys to every non-empty allowlist that lacks
-- them; organizations can switch either off afterwards. Empty allowlists are
-- seeded by the application and are left alone.
UPDATE "organization_settings"
SET "enabledModelIds" = "enabledModelIds" || ARRAY['heygen/avatar-iv']::TEXT[]
WHERE cardinality("enabledModelIds") > 0
  AND NOT ('heygen/avatar-iv' = ANY("enabledModelIds"));

UPDATE "organization_settings"
SET "enabledModelIds" = "enabledModelIds" || ARRAY['heygen/avatar-v']::TEXT[]
WHERE cardinality("enabledModelIds") > 0
  AND NOT ('heygen/avatar-v' = ANY("enabledModelIds"));
