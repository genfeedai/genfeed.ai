---
name: Production AWS Runtime
description: Live AWS source of truth for genfeed.ai production runtime
type: reference
last_verified: 2026-07-06
---

# Production AWS Runtime - genfeed.ai

Live AWS wins over older AL2023 EC2 migration notes.

## Current Runtime Posture

- **Region**: `us-west-1`. ⚠️ **Local AWS CLI default is `us-east-1`** — every
  prod SSM/infra command MUST pass `--region us-west-1` explicitly. Observed
  2026-07-06: webhook secrets written to us-east-1 via CLI default were
  invisible to production (silent — `put-parameter` succeeds either way).
- **SSM → containers**: TF `aws_ssm_parameters_by_path` on
  `/genfeed/production/` (`infra/terraform/genfeed-prod/data.tf:21`) injects
  every param under the path as container secrets on the next deploy's tofu
  render — new params need **no** task-def/TF enumeration, just the right
  region + a deploy.
- **ECS cluster**: `genfeed-production`, Fargate-only. Task definition
  revisions change on every deploy; verify live ECS state rather than relying
  on old EC2-era notes.
- **Running core services**: `api`, `workers`, `files`, `mcp`, and
  `notifications` are `desired=1`, `running=1`, `pending=0`.
- **Parked services**: `clips`, `discord`, `slack`, and `telegram` remain
  defined ECS services with `desired=0`, `running=0`.
- **ALB**: `genfeed-production-alb-774183965.us-west-1.elb.amazonaws.com`,
  internet-facing, active. Public target groups use `targetType=ip`; health is
  green for `api` on port `3010`, `mcp` on port `3014`, and `notifications` on
  port `3011`.
- **Public backend DNS**: Route53 `api.genfeed.ai`, `mcp.genfeed.ai`, and
  `notifications.genfeed.ai` are ALB aliases. Public health verification after
  stopping EC2 returned `200` for all three `/v1/health` endpoints.
- **Last verified ECS deploy**: GitHub Actions run `27759489824` completed on
  2026-06-18 from `master` and rolled the server image tag
  `05f7538e48cad75cbebf7a6405d09fc82d4db868`.
- **Public backend follow-up**: `mcp.genfeed.ai` and
  `notifications.genfeed.ai` were moved from previous A records on EIP
  `52.52.217.255` to ALB aliases on 2026-06-18.

## Legacy EC2 Host

- **Instance**: `i-0ba4418050d90bd32`, name `api.genfeed.ai-al2023`,
  Amazon Linux 2023, `t3a.large`, EIP `52.52.217.255`.
- **State**: stopped on 2026-06-18 after the API DNS cutover. It was not
  terminated.
- **Guards**: the old `Deploy Production` workflow has been removed from the
  repo; instance termination protection is enabled; instance and root volume are
  tagged `DoNotStart=true`,
  `StoppedFor=fargate-cutover-2026-06-18`, and
  `CutoverSnapshot=snap-0232fb7b41809e8e0`.
- **Rollback role only**: rollback means manually re-pointing affected public
  backend hostnames to `52.52.217.255` and starting the instance. Do not treat
  it as the intended managed production platform.
- **Historical access**: previous SSH path used Tailscale IP
  `100.101.125.109`; verify current access details before any rollback work.

## Deployment Path

- The old `Deploy Production` workflow was removed and should not be restored
  for normal backend deploys. It carried the old Tailscale/SSH/Docker Compose
  path to EC2.
- `Deploy ECS (production)` is the intended production backend deploy path. It
  is dispatch-only, production-environment gated, and master-only.
- The 2026-06-18 cutover was completed locally first, then the GitHub Actions
  deploy path was fixed and verified green with run `27759489824`.
- The workflow uses `opentofu/setup-opentofu@v2` with `tofu_wrapper: false`,
  runs migrations on Fargate, applies OpenTofu with `enable_dns_cutover=true`,
  and waits for ECS services to stabilize.
- Keep active services on overlapping deployments (`min_healthy=100`,
  `max_percent=200`). Workers verify Cloud Map dependency DNS at startup, so
  stop-then-start rolls can race and temporarily remove internal records.

## Tailscale

- The old EC2 deploy workflow depended on Tailscale OAuth + SSH and
  `TAILSCALE_INSTANCE_API_IP=100.101.125.109`.
- Fargate production deploys do not require Tailscale. GitHub Actions use OIDC
  to AWS and ECS service updates.

## Backups

- EC2 root volume `vol-0e73aa50957312b13`: no AWS Backup protected resource and
  no DLM lifecycle policy were present at cutover time.
- Rollback snapshot `snap-0232fb7b41809e8e0` was created before stopping EC2.
- RDS `genfeed-data`: automated backups are enabled with 1-day retention;
  manual snapshots exist from 2026-06-08 and 2026-06-09.

## Community Deployment

The ECS/Fargate stack is managed Genfeed production only. Community/self-hosted
deployment remains the all-in-one Docker image plus local Postgres:

- `docker/Dockerfile.selfhosted`
- `docker/docker-compose.selfhosted.yml`
- no AWS/ECR/SSM/RDS/ALB/Route53/OpenTofu requirement
