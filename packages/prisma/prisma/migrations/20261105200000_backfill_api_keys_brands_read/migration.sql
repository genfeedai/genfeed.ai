-- Brand read routes now require `brands:read` (or `brands:write`) on an API
-- key (#9200). Before this release any key holding a resource scope could read
-- brands, so every active key that could read brands keeps that access: it
-- gains `brands:read` once. Keys holding only narrow privileged scopes
-- (`credits:provision`, `managed-inference:execute`) could not read brands and
-- stay unchanged; `admin` keys pass every route already. A second run matches
-- no rows.
UPDATE "api_keys"
SET "scopes" = array_append("scopes", 'brands:read'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "isRevoked" = false
  AND NOT ("scopes" && ARRAY['brands:read', 'brands:write', 'admin']::TEXT[])
  AND "scopes" && ARRAY[
    'videos:read', 'videos:create', 'videos:update', 'videos:delete',
    'images:read', 'images:create', 'images:update', 'images:delete',
    'prompts:read', 'prompts:create', 'prompts:update', 'prompts:delete',
    'articles:read', 'articles:create',
    'posts:draft', 'posts:schedule', 'posts:approve', 'posts:publish',
    'analytics:read', 'credits:read'
  ]::TEXT[];
