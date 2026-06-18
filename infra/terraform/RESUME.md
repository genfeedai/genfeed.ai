# RESUME - genfeed.ai ECS/Fargate migration

Last verified against live AWS: 2026-06-18, after the public ALB cutover for
API, MCP, and notifications.

The managed production backend is now on ECS/Fargate behind the production ALB.
The old AL2023 EC2 host is stopped, not terminated, and retained only for
manual rollback.

## Facts

- Region: `us-west-1`.
- OpenTofu: `tofu` 1.12.x, S3 state bucket `genfeed-tfstate`.
- Apply dir: `infra/terraform/genfeed-prod`.
- Cluster: `genfeed-production`.
- ALB: `genfeed-production-alb-774183965.us-west-1.elb.amazonaws.com`.
- VPC: `vpc-0e7522e453a642bd8`.
- ECS task SG: `sg-0630fbed0bf8faafc`.
- Live ECS is the source of truth for current task definition revisions and
  image tags.
- Old EC2 host: `i-0ba4418050d90bd32`, `api.genfeed.ai-al2023`,
  EIP `52.52.217.255`, stopped on 2026-06-18.

## Live AWS State

- ECS cluster is Fargate-only:
  `registeredContainerInstances=0`, capacity providers `FARGATE` and
  `FARGATE_SPOT`.
- Active services: 9.
- Running core services: `api`, `workers`, `files`, `mcp`, `notifications`
  (`desired=1`, `running=1`, `pending=0`, rollout `COMPLETED`).
- Parked services: `clips`, `discord`, `slack`, `telegram`
  (`desired=0`, `running=0`).
- ALB target groups are healthy for `api` (`targetType=ip`, port `3010`),
  `mcp` (port `3014`), and `notifications` (port `3011`).
- Route53 `api.genfeed.ai`, `mcp.genfeed.ai`, and
  `notifications.genfeed.ai` are ALB aliases.
- Public health verification after stopping EC2 returned `200` for:
  `https://api.genfeed.ai/v1/health`, `https://mcp.genfeed.ai/v1/health`, and
  `https://notifications.genfeed.ai/v1/health`.

## Cutover Completed

- PR #639, `fix(infra): address ECS review follow-ups`, was merged into
  `master`.
- GHCR server image was copied to ECR.
- OpenTofu applied the migration task definition, then a Fargate migration task
  ran successfully with exit code `0`.
- OpenTofu applied the service rollout and `enable_dns_cutover=true`.
- All five core ECS services stabilized on Fargate.
- The old EC2 host was tagged, termination protection was enabled, and the
  instance was stopped.
- GitHub Actions deploy run `27759489824` later completed green from `master`
  with server image tag `05f7538e48cad75cbebf7a6405d09fc82d4db868`.
- Public `mcp.genfeed.ai` and `notifications.genfeed.ai` ALB/listener/DNS
  support was added in the follow-up cutover on 2026-06-18.

## CI/Deploy Status

- The old `Deploy Production` workflow was removed. It previously carried the
  repo path to `_Deploy` -> Tailscale -> SSH -> Docker Compose for the AL2023
  EC2 host and must not be used for normal backend deploys.
- `Deploy ECS (production)` is active and is the normal backend deploy path.
- Run `27756338031` failed before OpenTofu execution because `tofu` was not on
  PATH after `opentofu/setup-opentofu@v1`.
- The workflow now uses `opentofu/setup-opentofu@v2` with
  `tofu_wrapper: false`, passes `enable_dns_cutover=true`, has the required SSM
  and RDS IAM reads, and was verified green with run `27759489824`.
- `Build Server Image` remains active and publishes GHCR server images on
  server-affecting master pushes; ECS receives a new ECR image only when
  `Deploy ECS (production)` copies GHCR to ECR.
- Active ECS services should roll with `min_healthy=100` and `max_percent=200`.
  Workers verify Cloud Map dependency DNS at startup, so stop-then-start rolls
  can race when `files` or `notifications` records briefly disappear.

## Tailscale Status

- Historical EC2 Tailscale IP: `100.101.125.109`.
- Fargate deploy does not need Tailscale; it uses GitHub OIDC to AWS and ECS
  service updates.
- Keep the old Tailscale details only for rollback/debugging the stopped EC2
  host.

## Backup Status

- EC2 root volume `vol-0e73aa50957312b13`: no AWS Backup protected resource and
  no DLM policy were present at cutover time.
- Rollback snapshot: `snap-0232fb7b41809e8e0`, created before stopping EC2.
- RDS `genfeed-data`: automated backups enabled with 1-day retention; manual
  snapshots exist from 2026-06-08 and 2026-06-09.

## Rollback

Rollback is manual:

1. Start EC2 instance `i-0ba4418050d90bd32`.
2. Re-point any public backend hostnames being rolled back
   (`api.genfeed.ai`, `mcp.genfeed.ai`, `notifications.genfeed.ai`) to EIP
   `52.52.217.255`.
3. Verify the old nginx/Docker API path before sending user traffic.

`enable_dns_cutover=false` only destroys Terraform-managed ALB alias records; it
does not recreate old manual A records.

## Community Deployment Impact

None. The Fargate stack is only the managed genfeed.ai production runtime.
Community deployment remains the published all-in-one Docker image plus
Postgres via `docker/docker-compose.selfhosted.yml`. It does not require AWS,
ECR, SSM, Route53, RDS, ALB, OpenTofu, or the production VPC.

## Follow-ups

- Remove broad temporary IAM privileges from the `genfeedai` IAM user after the
  migration work is complete.
- Per-PR Fargate previews (design in `PREVIEW.md`).
- Voice catalog reseed once valid ElevenLabs/HeyGen production keys are in SSM.
- `cdnUrl`/`s3Key` backfill on migrated assets.
