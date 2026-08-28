-- Hard cut: product operations now persist exclusively as immutable workflow
-- executions and action-backed node results. The standalone runs control plane
-- has no runtime reader, compatibility projection, or archival fallback.
DROP TABLE IF EXISTS "runs";
