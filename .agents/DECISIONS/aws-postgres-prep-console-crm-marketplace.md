# AWS/Postgres Prep Decisions

## Scope

Prepare `../console`, `../crm`, and `../marketplace.genfeed.ai` for the AWS Postgres target state without pretending the Mongo-to-Postgres data migration is already complete.

## Decision

Use `DATABASE_URL` as the canonical database target in all three repos, and quarantine the current Mongo runtime behind a legacy bridge surface.

## Why

- `genfeed.ai` already moved its supported backend path to `DATABASE_URL`.
- The sibling repos are inconsistent today: `console` preflight already expects `DATABASE_URL`, while runtime/docs still talk about `MONGODB_URI`.
- Full removal of Mongoose is a separate migration and would be risky to bundle into this prep pass.

## Chosen Shape

- `DATABASE_URL` documents the AWS Postgres cluster target everywhere.
- `LEGACY_MONGODB_URI` becomes the preferred temporary bridge for code that still runs on Mongoose.
- Existing `MONGODB_URI` remains a compatibility fallback so current local setups do not hard-break.
- Docs/examples stop advertising MongoDB Atlas as the primary architecture.

## Rejected Options

### Full ORM migration now

Rejected because it spans three repos with broad model/service rewrites and data migration work. That is a separate project.

### Rename every package/app from `admin` to `console` in the same pass

Rejected because package-name churn would create unrelated breakage. This pass updates the workspace naming/documentation only where low-risk.

## Exit Criteria

- Every repo exposes `DATABASE_URL` in examples/docs.
- Legacy Mongo runtime is clearly marked as temporary.
- Runtime/script entrypoints prefer `LEGACY_MONGODB_URI` and only fall back to `MONGODB_URI`.
- `console` no longer depends on the removed shared `mongodbSchema` export.
