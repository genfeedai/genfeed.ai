packages: @genfeedai/contracts @genfeedai/serializers @genfeedai/prisma

Add immutable outlier snapshot, performance and organization-configuration models
with a tenant-scoped snapshot foreign key. PostAnalytics adds nullable provider
eligibility flags and an active-row flag.

Export shared outlier account, observation, configuration validation and serialized
response contracts, plus the required analytics persistence account context. Export
OutlierBaselineSnapshotSerializer, OutlierPostPerformanceSerializer and
OutlierConfigurationSerializer. Responses preserve nullable ratios and eligibility
provenance without exposing raw provider data.

Apply the additive migration before the API rollout. Existing analytics processing
callers must pass the resolved organization, brand and credential context. See
`docs/outlier-baselines.md` for lazy backfill and retry behavior. Refs #4403.
