# RESUME — genfeed.ai ECS/Fargate migration (PR #609)

Hand-off state for continuing in a new session. **PROD IS UNTOUCHED + LIVE** —
`api.genfeed.ai` → `52.52.217.255` (old EC2 box). No cutover happened. Zero user
impact. Everything below is the *parallel* ECS platform being stood up.

## Tooling / facts (read first)
- Run with **OpenTofu (`tofu`)**, NOT terraform — state is tofu 1.12 in S3
  (`genfeed-tfstate`, native lockfile). CI's deploy-ecs.yml still uses
  `terraform` 1.10.5 → **must switch to opentofu/setup-opentofu** before that
  workflow runs (state-version mismatch risk).
- Always `export AWS_DEFAULT_REGION=us-west-1`.
- AWS account `948918267147`, IAM user `genfeedai` (has TEMPORARY
  AdministratorAccess — **detach after migration is done**).
- Apply dir: `infra/terraform/genfeed-prod`. Always pass
  `-var="image_tag=66f97e5a116d7aa3cabea80cae97fb69705c58f6"` (master image in ECR).
- ECR image: `948918267147.dkr.ecr.us-west-1.amazonaws.com/genfeed/server:66f97e5a116d7aa3cabea80cae97fb69705c58f6`
- ALB DNS: `genfeed-production-alb-774183965.us-west-1.elb.amazonaws.com`
- Cluster `genfeed-production`; private subnets `subnet-09ddda2bcf4a385c2`,
  `subnet-058e42079550dd81f`; ECS SG `sg-0630fbed0bf8faafc`.
- Old box to stop (NOT terminate) after cutover: `i-0ba4418050d90bd32` / EIP `52.52.217.255`.

## Done
- Bootstrap applied (S3 state bucket + GitHub OIDC + `gha-genfeed-deploy` role).
  Repo vars set: `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`.
- genfeed-prod applied: ECS cluster (**Fargate-only** — t3a.medium can't ENI-trunk,
  so EC2 capacity was torn down: CP deleted manually, ASG deleted), ALB + ACM +
  (gated) Route53, NAT gateway, **2 private subnets** (10.0.11/12.0/24) in
  genfeedai-vpc `vpc-0e7522e453a642bd8`, ElastiCache `cache.t4g.micro`, Cloud Map
  `genfeed.internal`, IAM exec/task roles, ECR (image pushed).
- 9 ECS services exist: **core 5 desired=1** (api, workers, files, mcp,
  notifications); **bots/clips desired=0 (parked** — code stays, flip on by
  setting `desired=1` in `locals.tf` + apply).
- Prod RDS `genfeed-data` schema already current (migrations ran via the old-box
  deploy earlier) — Fargate services point at it via SSM `DATABASE_URL`.
- Wiring fixes already applied: REDIS_URL→ElastiCache + REDIS_PASSWORD filtered
  from secrets; env-overridden SSM keys filtered from secrets; ALB target_type=ip;
  awsvpc + NAT egress; DNS cutover gated behind `enable_dns_cutover` (default false).

## ⛔ CURRENT BLOCKER (resume here)
The **5 core Fargate tasks won't start — running=0, IN_PROGRESS.** Even `files`
(which has no dependency check) is at 0, so it's almost certainly **infra**, not
the app boot-ordering. Diagnose first:

```bash
export AWS_DEFAULT_REGION=us-west-1
CL=genfeed-production
T=$(aws ecs list-tasks --cluster $CL --service-name files --desired-status STOPPED --query 'taskArns[0]' --output text)
aws ecs describe-tasks --cluster $CL --tasks "$T" \
  --query 'tasks[0].{stopped:stoppedReason,reason:containers[0].reason,exit:containers[0].exitCode}'
aws logs tail /ecs/genfeed-production/files --since 15m --format short | tail -20
```

Most likely causes (in order):
1. **`CannotPullContainerError`** → Fargate can't reach ECR. Check NAT egress from
   the private subnets (route table 0.0.0.0/0 → NAT), or add ECR/S3/logs VPC
   endpoints. (Fargate pulls via the task ENI, which is in the private subnets.)
2. **Secrets/exec-role** → execution role `genfeed-production-task-execution` must
   have `ssm:GetParameters` on `/genfeed/production/*` + `kms:Decrypt` (added in
   iam.tf — verify it actually attached) + `AmazonECSTaskExecutionRolePolicy`.
   A `ResourceInitializationError` about SSM = this.
3. **ENI / subnet IP** → unlikely (Fargate, /24 subnets).

Fix the root cause, then `tofu apply -var="image_tag=66f97e5a116d7aa3cabea80cae97fb69705c58f6"`
(or just let ECS retry once infra is fixed).

## Then (finish line)
1. Confirm core 5 healthy: `aws ecs describe-services --cluster genfeed-production --services api workers files mcp notifications --query 'services[].{n:serviceName,run:runningCount}'`
2. **Smoke-test (no DNS flip):** `curl -H 'Host: api.genfeed.ai' https://genfeed-production-alb-774183965.us-west-1.elb.amazonaws.com/v1/health`
3. **Cutover:** `tofu apply -var="image_tag=66f97e5a116d7aa3cabea80cae97fb69705c58f6" -var="enable_dns_cutover=true"` → flips api.genfeed.ai → ALB.
4. **Stop** (not terminate) the old box `i-0ba4418050d90bd32` for ~1 week (rollback = re-point DNS to its EIP / `enable_dns_cutover=false`).
5. Detach AdministratorAccess from `genfeedai`.

## Follow-ups (separate)
- Fix `deploy-ecs.yml`: migrate run-task `--launch-type FARGATE` (+ awsvpc network
  config), and switch setup-terraform → setup-opentofu (state-tool consistency).
- Per-PR Fargate previews (design in `PREVIEW.md`) — pick preview-DB approach.
- Voice catalog reseed — BLOCKED: ElevenLabs + HeyGen system keys in SSM are
  invalid (both 401). Set valid keys in `/genfeed/production/*`, then run
  `scripts/migrations/reseed-voice-catalog.incontainer.mjs` (or the endpoint).
- cdnUrl/s3Key backfill on migrated assets.
