# genfeed.ai - ECS/Fargate Terraform

Last verified against live AWS: 2026-06-18, after the production API cutover.

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
  (`desired=1`, `running=1`, `pending=0`), all on task definition revision `:4`
  for image tag `dbf06f145a594ba9919d9f6eff96a8e3a7b3dabd`.
- Parked services: `clips`, `discord`, `slack`, `telegram`
  (`desired=0`, `running=0`). They are still defined and can be enabled by
  changing `locals.tf`.
- ALB: `genfeed-production-alb-774183965.us-west-1.elb.amazonaws.com`, active,
  with a healthy IP target for `api` on port `3010`.
- Public API DNS: Route53 `api.genfeed.ai` is an ALB alias. Post-stop health
  verification returned `200` from ALB IP `52.9.20.128`.
- Other public backend hostnames: `mcp.genfeed.ai` and
  `notifications.genfeed.ai` still point to old EIP `52.52.217.255`. Add public
  ALB/listener/DNS support or retire those records before relying on them after
  the EC2 stop.
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
  secret (env var = last path segment). Ensure `REDIS_URL` points at ElastiCache
  and provider keys are valid.

## Production Deploy Paths

- `Deploy Production` is disabled manually. It was the old Tailscale + SSH +
  Docker Compose deploy path to the AL2023 EC2 host and should not be used for
  normal backend deploys.
- `Deploy ECS (production)` is active and is the intended backend deploy path.
  It is dispatch-only, uses the GitHub `production` environment approval, and
  refuses to run from anything except `refs/heads/master`.
- The 2026-06-18 run copied GHCR `server:dbf06f145...` to ECR but failed before
  OpenTofu execution because `tofu` was not on PATH. The live cutover was
  completed locally with OpenTofu.
- The workflow should use `opentofu/setup-opentofu@v2` with
  `tofu_wrapper: false`, then:

1. Copy `ghcr.io/genfeedai/genfeed.ai/server:<sha>` to ECR.
2. Register/run the Prisma migration task on Fargate in the private subnets.
3. `tofu apply -var="image_tag=<sha>"` to roll services.
4. Wait for every ECS service to stabilize.

## Cutover and Rollback

The API cutover was completed on 2026-06-18:

1. Registered the migration task definition and ran Prisma migrations on
   Fargate. Exit code was `0`; no pending migrations.
2. Applied OpenTofu with
   `-var="image_tag=dbf06f145a594ba9919d9f6eff96a8e3a7b3dabd"`
   and `-var="enable_dns_cutover=true"`.
3. Verified all five core ECS services were stable.
4. Verified `api.genfeed.ai` resolves to the ALB and `/v1/health` returns `200`
   after stopping EC2.
5. Stopped, but did not terminate, the old EC2 host.

Rollback is manual:

1. Start EC2 instance `i-0ba4418050d90bd32`.
2. Re-point Route53 `api.genfeed.ai` to EIP `52.52.217.255`.
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
