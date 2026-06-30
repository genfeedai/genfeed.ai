# genfeed.ai - ECS/Fargate Terraform

Last verified against live AWS: 2026-06-18, after the public ALB cutover for
API, MCP, and notifications.

Managed production infrastructure for genfeed.ai only. Community self-hosting
stays on the Docker path in `docker/Dockerfile.selfhosted` and
`docker/docker-compose.selfhosted.yml`; this stack is not required for the
AGPL/community deployment.

The February AL2023 EC2 host is no longer the managed-production platform. It
is stopped and retained only as a manual rollback host.

## Current AWS State

- Region: `us-west-1`.
- ECS cluster: `genfeed-production`, Fargate-only
  (`registeredContainerInstances=0`, capacity providers `FARGATE` and
  `FARGATE_SPOT`).
- Running core services: `api`, `workers`, `files`, `mcp`, `notifications`
  (`desired=1`, `running=1`, `pending=0` at the last verification). Task
  definition revisions change on every deploy; live AWS is the source of truth.
- Last verified ECS deploy path: GitHub Actions run `27759489824` completed
  from `master`. Live ECS is the source of truth for current task definitions.
- Parked services: `clips`, `discord`, `slack`, `telegram`
  (`desired=0`, `running=0`). They are still defined and can be enabled by
  changing `locals.tf`.
- ALB: `genfeed-production-alb-774183965.us-west-1.elb.amazonaws.com`, active,
  with healthy IP targets for `api` on port `3010`, `mcp` on port `3014`, and
  `notifications` on port `3011`.
- Public backend DNS: Route53 `api.genfeed.ai`, `mcp.genfeed.ai`, and
  `notifications.genfeed.ai` are ALB aliases. Public health verification for
  all three `/v1/health` endpoints returned `200` from ALB IPs.
- Legacy EC2 host: `i-0ba4418050d90bd32` / EIP `52.52.217.255` is stopped, not
  terminated. Termination protection is enabled, and the instance/root volume
  are tagged `DoNotStart=true`, `StoppedFor=fargate-cutover-2026-06-18`, and
  `CutoverSnapshot=snap-0232fb7b41809e8e0`.

## Layout

- `bootstrap/` - run once locally with admin creds. Creates the S3 state bucket
  (S3-native locking, no DynamoDB) + GitHub OIDC provider + `gha-genfeed-deploy`
  role. Uses local state.
- `genfeed-prod/` - the cluster, ALB, ECR, IAM, ElastiCache, Cloud Map, and the
  9 ECS/Fargate services. S3 backend.
- `modules/service/` - reusable task-def + ECS service + logs + Cloud Map
  (+ optional ALB).

## Tooling

Use OpenTofu, not Terraform. The live state was written by OpenTofu 1.12.x and
is stored in S3.

```bash
export AWS_DEFAULT_REGION=us-west-1
cd infra/terraform/genfeed-prod
tofu init
```

## One-time Setup

```bash
# 1. Bootstrap (admin creds)
cd infra/terraform/bootstrap
tofu init && tofu apply
#  -> note outputs: state_bucket, gha_deploy_role_arn
#  -> add gha_deploy_role_arn as the GitHub Actions variable AWS_DEPLOY_ROLE_ARN

# 2. Main stack
cd ../genfeed-prod
tofu init
tofu plan
tofu apply

# 3. Push the server image to ECR, then apply with the tag.
#    CI does this on deploy:
#    docker buildx imagetools create -t <ecr_url>:<sha> ghcr.io/genfeedai/genfeed.ai/server:<sha>
tofu apply -var="image_tag=<sha>"
```

## Assumptions

- VPC: defaults to `genfeedai-vpc` plus two stack-created private subnets for
  Fargate tasks and ElastiCache.
- DNS: assumes `genfeed.ai` is a Route53 hosted zone.
- RDS: looks up `genfeed-data` by identifier and opens its SG to the ECS tasks SG.
- Secrets: every SSM param under `/genfeed/production/*` is injected as a task
  secret (env var = last path segment), except Terraform-owned runtime values
  that are injected directly to avoid duplicate ECS env names. Production Redis
  uses `REDIS_URL=rediss://<elasticache-primary>:6379`,
  `REDIS_TLS=true`, and Terraform-managed SSM SecureString
  `/genfeed/production/REDIS_PASSWORD`.

## Production Deploy Paths

- The old `Deploy Production` workflow was removed. It previously carried the
  legacy Tailscale + SSH + Docker Compose production path to the AL2023 EC2
  host and must not be recreated for normal backend deploys.
- `Deploy ECS (production)` is active and is the intended backend deploy path.
  It is dispatch-only, uses the GitHub `production` environment approval, and
  refuses to run from anything except `refs/heads/master`.
- The 2026-06-18 cutover was completed locally first, then the GitHub Actions
  deploy path was fixed and verified green with run `27759489824`.
- The workflow uses `opentofu/setup-opentofu@v2` with `tofu_wrapper: false`,
  then:

1. Copy `ghcr.io/genfeedai/genfeed.ai/server:<sha>` to ECR.
2. Register/run the Prisma migration task on Fargate in the private subnets.
3. `tofu apply -var="image_tag=<sha>" -var="enable_dns_cutover=true"` to roll
   services and preserve public ALB aliases.
4. Wait for every ECS service to stabilize.

Active services should roll with `min_healthy=100` and `max_percent=200`.
Workers verify dependent Cloud Map DNS during startup; stop-then-start deploys
can temporarily remove `files.genfeed.internal` or
`notifications.genfeed.internal` and make workers exit.

## Redis TLS and Auth

Production ElastiCache is configured with at-rest encryption, in-transit
encryption, and AUTH. Terraform generates a 64-character auth token with the
`random` provider, stores it in SSM Parameter Store as
`/genfeed/production/REDIS_PASSWORD`, and injects that parameter into every ECS
task definition as a secret. The Redis URL stays a non-secret container
environment value:

```text
REDIS_URL=rediss://<elasticache-primary-endpoint>:6379
REDIS_TLS=true
REDIS_PASSWORD=<from SSM SecureString>
```

The app Redis clients accept `REDIS_PASSWORD` separately from `REDIS_URL`, so
the token does not need to be embedded into a plaintext task-definition
environment value. The Terraform state is still sensitive infrastructure state:
the generated token is marked sensitive by the providers, and the S3 state
bucket must remain private.

Rollout is through the normal `Deploy ECS (production)` workflow from `master`.
The pre-roll task-definition target references the ElastiCache endpoint and the
Redis password parameter, so OpenTofu includes those dependencies before the
boot-smoke task runs. Do not manually set a stale `/genfeed/production/REDIS_URL`
SSM parameter; Terraform sets `REDIS_URL` and `REDIS_TLS` as task environment
values.

## Cutover and Rollback

The API cutover was completed on 2026-06-18:

1. Registered the migration task definition and ran Prisma migrations on
   Fargate. Exit code was `0`; no pending migrations.
2. Applied OpenTofu with `-var="enable_dns_cutover=true"` to move
   `api.genfeed.ai` to the ALB.
3. Verified all five core ECS services were stable.
4. Verified `api.genfeed.ai` resolves to the ALB and `/v1/health` returns `200`
   after stopping EC2.
5. Stopped, but did not terminate, the old EC2 host.

The public backend follow-up was completed on 2026-06-18:

1. Attached `mcp` and `notifications` Fargate services to dedicated ALB target
   groups with host-header HTTPS listener rules.
2. Added ACM SNI coverage for `mcp.genfeed.ai` and
   `notifications.genfeed.ai`.
3. Replaced the stale Route53 A records for `mcp.genfeed.ai` and
   `notifications.genfeed.ai`, which pointed at `52.52.217.255`, with ALB
   aliases.
4. Verified `api.genfeed.ai`, `mcp.genfeed.ai`, and
   `notifications.genfeed.ai` all resolve to ALB IPs and return `200` on
   `/v1/health`.

The CI deploy path was later verified green from `master` with GitHub Actions
run `27759489824`, using server image tag
`05f7538e48cad75cbebf7a6405d09fc82d4db868`.

Rollback is manual:

1. Start EC2 instance `i-0ba4418050d90bd32`.
2. Re-point any public backend hostnames being rolled back
   (`api.genfeed.ai`, `mcp.genfeed.ai`, `notifications.genfeed.ai`) to EIP
   `52.52.217.255`.
3. Verify the old nginx/Docker path before sending user traffic.

`enable_dns_cutover=false` only removes the Terraform-managed ALB alias record;
it does not recreate the old manual A record.

## Backup State

Live backup posture as of 2026-06-18:

- EC2 root volume `vol-0e73aa50957312b13`: no AWS Backup protected resource and
  no DLM lifecycle policy were present at cutover time.
- Rollback snapshot `snap-0232fb7b41809e8e0` was created before stopping EC2.
- RDS `genfeed-data`: automated backups enabled with 1-day retention; latest
  restorable time was current at verification. There are also two manual June
  snapshots.

## Community Deployment

No managed AWS dependency is introduced for community users. The community
deployment remains:

- `docker/Dockerfile.selfhosted` for the published all-in-one image.
- `docker/docker-compose.selfhosted.yml` for app + API + Postgres.
- Local Postgres plus embedded Redis in the self-hosted container.
- No ECR, SSM, ALB, RDS, Route53, or OpenTofu requirement.

The community image is guarded by `Build Verify (Self-Hosted)` on PRs and
`Self-Hosted Release E2E` after publishes/scheduled runs.
