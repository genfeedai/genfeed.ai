# Marketplace production release

This stack deploys the separate Marketplace repository's API behind the existing
hosted SaaS ALB at `api.marketplace.<DOMAIN>`. It owns a separate ECS service,
task roles, ECR repository, security group, certificate, log groups and state.
It consumes only non-secret network outputs from `hosted-saas`. Marketplace
does not need Redis and does not use the Genfeed application's database URL.

The public `Deploy hosted SaaS` workflow accepts `marketplace_source_sha`.
When supplied, it verifies that exact commit against Marketplace's master,
releases Genfeed first, provisions/migrates/rolls Marketplace, and then deploys
the Marketplace Vercel frontend from the same Marketplace commit. An empty SHA
retains the existing Genfeed-only release path. Never deploy this frontend from
a workspace CLI, Console, or Vercel Git auto-deploy.

## Production configuration

Add these to this repository's protected `production` environment:

| Setting | Purpose |
| --- | --- |
| `VERCEL_PROJECT_MARKETPLACE` variable | Existing Marketplace Vercel project ID; confirm its domain and `apps/web` root directory in Vercel. |
| `MARKETPLACE_SSM_PATH` variable | Dedicated absolute SSM namespace, outside the recursively injected Genfeed `SSM_PATH`. No trailing slash. |
| `MARKETPLACE_DATABASE_ADMIN_PARAMETER` variable | Optional SSM parameter **name**, containing an administrator PostgreSQL URL for initial provisioning. Never the URL itself. |
| `MARKETPLACE_DEPLOY_TOKEN` secret | GitHub credential with contents-read access to `genfeedai/marketplace.genfeed.ai`. |

The release reuses existing `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `PROJECT`,
`DOMAIN`, `RDS_INSTANCE_ID`, `TF_STATE_BUCKET`, `TF_STATE_KEY`, Vercel identity
and frontend observability settings. Account-specific IDs and credentials stay
in environment settings. The existing CI OIDC role must additionally permit
Marketplace ECR pushes, separate state access/locking, the resources in this
stack, scoped SSM operations, ECS operations, and RDS snapshot creation.

Store these as SSM SecureStrings under `MARKETPLACE_SSM_PATH`:

| Parameter | Consumer |
| --- | --- |
| `DATABASE_URL` | Running API: dedicated `marketplace` database and `marketplace_runtime` role. |
| `MIGRATION_DATABASE_URL` | Migration task only: same database with `marketplace_migrator` owner role. |
| `STRIPE_SECRET_KEY` | Marketplace payment operations. |
| `STRIPE_WEBHOOK_SECRET` | Verification of the dedicated Marketplace webhook endpoint. |

If either database URL is absent, the bootstrap task uses the administrator
parameter to create the fresh database and isolated roles and stores their
generated URLs. Use an administrator URL for the existing RDS instance with
verified TLS. Bootstrap rejects unmanaged existing roles, unexpected database
ownership, privileged app roles, and reuse of the administrator identity.
Credentials persist before role creation so interrupted runs can retry.
Runtime may perform DML but cannot create schema objects; migration credentials
and administrator credentials never enter the API container. Initial setup is
tested with a non-superuser administrator holding CREATEROLE/CREATEDB, matching
the relevant RDS permission boundary.

For a database already initialized with `db push`, compare its schema with the
initial migration and establish a verified baseline first. Do not apply the
initial migration blindly to existing data. The workflow snapshots the existing
RDS instance before Marketplace migrations, waits for migration success, then
rolls the API with readiness checks and only creates the API DNS alias after a
healthy ALB target is present. The Vercel frontend is gated on API success.

The separate backend key is `<TF_STATE_KEY>.marketplace`. Keep this stack's
state under the same production access controls as the main state. Run both
stacks through public CI; never copy production state or secrets into source.

## Verification and launch

Merge the Marketplace and public release PRs after their required checks pass.
Dispatch `Deploy hosted SaaS` from public master with exact master SHAs for
`source_sha` and `marketplace_source_sha` (or supply the Marketplace SHA when
cutting a `Release`). Keep the release on the public monorepo lane.

The workflow checks HTTPS readiness and catalog responses. After it succeeds,
verify a real Genfeed sign-in from the Marketplace library/dashboard, seller
submission/operator approval, a free claim/download, and an authorized Stripe
test checkout with successful webhook delivery and Connect payouts. The
Marketplace UI reads catalog/library data from its API and obtains session JWTs
through the Genfeed app origin; Genfeed's release adds the configured Marketplace
origin to Better Auth trust without widening self-hosted defaults.

The Genfeed workspace installation/publishing bridge remains separate from
this release work; it still needs its authenticated Marketplace API contract
updated. Do not treat a catalog or free download smoke test as proof that
cross-product installation, real payments, or payouts work.

Local validation: `tofu init -backend=false`, `tofu validate`, `tofu fmt -check`,
workflow actionlint and deployment contract tests. An AWS-authenticated plan
and production cutover remain necessary before claiming production readiness.
