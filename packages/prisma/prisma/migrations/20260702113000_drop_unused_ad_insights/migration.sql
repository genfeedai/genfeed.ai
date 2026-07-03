-- Drop the never-used ad_insights table.
-- The AdInsights feature was scaffolding only: the API modules were never
-- registered, the aggregation processor was an empty stub, and no code path
-- ever read from or wrote to this table.
DROP TABLE IF EXISTS "ad_insights";
