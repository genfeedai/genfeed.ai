# genfeed.ai — ECS-hybrid Terraform

Replaces the SSH-waves deploy with **AWS ECS** (EC2 capacity for steady services
+ Fargate for per-PR previews). genfeed.ai only.

## Layout

- `bootstrap/` — run ONCE locally with admin creds. Creates the S3 state bucket
  (S3-native locking, no DynamoDB) + GitHub OIDC provider + `gha-genfeed-deploy`
  role. Uses local state.
- `genfeed-prod/` — the cluster, ALB, ECR, IAM, ElastiCache, Cloud Map, and the
  9 ECS services. S3 backend.
- `modules/service/` — reusable task-def + ECS service + logs + Cloud Map (+ optional ALB).

## One-time setup

```bash
# 1. Bootstrap (admin creds)
cd infra/terraform/bootstrap
terraform init && terraform apply
#  -> note outputs: state_bucket, gha_deploy_role_arn
#  -> add gha_deploy_role_arn as the GitHub Actions variable AWS_DEPLOY_ROLE_ARN

# 2. Main stack
cd ../genfeed-prod
terraform init
terraform plan            # review carefully (first plan surfaces VPC/zone specifics)
terraform apply           # gated — human approves

# 3. Push the server image to ECR (first time), then re-apply with the tag
#    (CI does this on every deploy; first time can be manual):
#    docker buildx imagetools create -t <ecr_url>:<sha> ghcr.io/genfeedai/genfeed.ai/server:<sha>
terraform apply -var="image_tag=<sha>"

# 4. Point REDIS at ElastiCache (one-time):
#    set SSM /genfeed/production/REDIS_URL = redis://<redis_primary_endpoint>:6379

# 5. Smoke-test via the ALB DNS BEFORE flipping DNS:
#    curl https://<alb_dns_name>/v1/health   (Host header api.genfeed.ai if needed)
```

## Assumptions to verify on first `plan`

- VPC: defaults to the **default VPC** + all its subnets. Override `vpc_id` /
  `public_subnet_ids` / `private_subnet_ids` if genfeed runs elsewhere.
- DNS: assumes `genfeed.ai` is a **Route53** hosted zone (cert validation + the
  `api` A-alias). If DNS is at a registrar, set `route53_zone_id` or move the
  zone / handle ACM validation manually.
- RDS: looks up `genfeed-data` by identifier and opens its SG to the ECS tasks SG.
- Secrets: every SSM param under `/genfeed/production/*` is injected as a task
  secret (env var = last path segment). Ensure `REDIS_URL` points at ElastiCache
  (step 4) and the provider keys are valid.

## Cutover (in-place)

1. `terraform apply` (enable_dns_cutover=false, the default) — builds the cluster,
   ALB, ECR, ElastiCache, services. Does NOT touch api.genfeed.ai DNS, so the old
   box keeps serving traffic. (Services crash-loop until the image is pushed — fine,
   no traffic.)
2. Push the image to ECR + `terraform apply -var="image_tag=<sha>"` → services
   go healthy.
3. Smoke-test via the **ALB DNS name** (`terraform output alb_dns_name`):
   `curl -H 'Host: api.genfeed.ai' https://<alb_dns>/v1/health`.
4. **Cutover:** `terraform apply -var="image_tag=<sha>" -var="enable_dns_cutover=true"`
   → creates the api.genfeed.ai A-record → ALB. (Lower the record TTL beforehand.)
5. Keep the old EC2 box **stopped, not terminated**, for ~1 week (snapshot first).
   Rollback = re-point api.genfeed.ai at the box's EIP / `enable_dns_cutover=false`.
5. Remove the SSH deploy (`docker/deploy-common.sh`, `deploy-*.sh`,
   `render-ssm-env.sh`, Tailscale steps) in a follow-up PR.
