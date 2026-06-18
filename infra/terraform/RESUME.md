# RESUME - genfeed.ai ECS/Fargate migration

Last verified against live AWS: 2026-06-18, after the production API cutover.

The managed production API is now on ECS/Fargate behind the production ALB.
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
- Current production image:
  `948918267147.dkr.ecr.us-west-1.amazonaws.com/genfeed/server:dbf06f145a594ba9919d9f6eff96a8e3a7b3dabd`.
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
- ALB target group is healthy for the API target (`targetType=ip`, port `3010`).
- Route53 `api.genfeed.ai` is an ALB alias.
- Public health verification after stopping EC2:
  `curl https://api.genfeed.ai/v1/health` returned `200` from ALB IP
  `52.9.20.128`.
- `mcp.genfeed.ai` and `notifications.genfeed.ai` still point to
  `52.52.217.255`. Those public names need explicit ALB/listener/DNS work or
  retirement if they should remain available without EC2.

## Cutover Completed

- PR #639, `fix(infra): address ECS review follow-ups`, was merged into
  `master`.
- GHCR server image `dbf06f145...` was copied to ECR.
- OpenTofu applied the migration task definition, then a Fargate migration task
  ran successfully with exit code `0`.
- OpenTofu applied the service rollout and `enable_dns_cutover=true`.
- All five core ECS services stabilized on task definition revision `:4`.
- The old EC2 host was tagged, termination protection was enabled, and the
  instance was stopped.

## CI/Deploy Status

- `Deploy Production` is disabled manually. It was the old EC2 deploy path:
  `_Deploy` -> Tailscale -> SSH -> Docker Compose.
- `Deploy ECS (production)` is active and should be the normal backend deploy
  path after the workflow fix is merged.
- Run `27756338031` failed before OpenTofu execution because `tofu` was not on
  PATH after `opentofu/setup-opentofu@v1`.
- The workflow should use `opentofu/setup-opentofu@v2` with
  `tofu_wrapper: false`; the live production rollout was completed locally with
  OpenTofu while the workflow fix was prepared.
- `Build Server Image` remains active and publishes GHCR server images on
  server-affecting master pushes; ECS receives a new ECR image only when
  `Deploy ECS (production)` copies GHCR to ECR.

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
2. Re-point Route53 `api.genfeed.ai` to EIP `52.52.217.255`.
3. Verify the old nginx/Docker API path before sending user traffic.

`enable_dns_cutover=false` only destroys the Terraform-managed ALB alias record;
it does not recreate the old manual A record.

## Community Deployment Impact

None. The Fargate stack is only the managed genfeed.ai production runtime.
Community deployment remains the published all-in-one Docker image plus
Postgres via `docker/docker-compose.selfhosted.yml`. It does not require AWS,
ECR, SSM, Route53, RDS, ALB, OpenTofu, or the production VPC.

## Follow-ups

- Merge and verify the `Deploy ECS (production)` workflow fix.
- Decide whether `mcp.genfeed.ai` and `notifications.genfeed.ai` should get
  public ALB/listener/DNS support or be retired.
- Remove broad temporary IAM privileges from the `genfeedai` IAM user after the
  migration work is complete.
- Per-PR Fargate previews (design in `PREVIEW.md`).
- Voice catalog reseed once valid ElevenLabs/HeyGen production keys are in SSM.
- `cdnUrl`/`s3Key` backfill on migrated assets.
