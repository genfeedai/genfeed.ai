# Per-PR preview environments (Fargate) — design for the next PR

Steady-state ECS (this PR) ships first. Previews are the immediate follow-up;
they share the same cluster's **Fargate** capacity provider (scale-to-zero, $0
when no PR is open) and the same ALB.

## Shape

On `pull_request: opened|synchronize`:
1. Build the PR image → ECR tag `pr-<n>` (reuse `build-server-image` + the
   GHCR→ECR copy from `deploy-ecs.yml`).
2. `module "preview-env"` (Fargate, awsvpc, `assign_public_ip` for ECR pull):
   a Fargate **api** task (+ the deps it needs — see open decision) registered to
   a per-PR ALB target group + a host-rule on the prod ALB HTTPS listener
   (`pr-<n>.preview.genfeed.ai`).
3. Route53 `pr-<n>.preview.genfeed.ai` → ALB; comment the URL on the PR.

On `pull_request: closed`: destroy the PR's Fargate service, target group,
listener rule, DNS record, ECR `pr-<n>` tag, and its DB schema.

## Prereqs to add

- **Wildcard cert**: add `*.preview.genfeed.ai` as a SAN on the ACM cert (or a
  second cert) attached to the HTTPS listener.
- **Listener rules**: host-based rule per PR (priority = PR number offset).
- **Fargate**: previews run on `FARGATE` capacity provider (already attached to
  the cluster), so they never consume the EC2 boxes.

## OPEN DECISION — preview database (pick before building)

A preview needs a DB. Options:
1. **Schema-per-PR on the existing dev RDS (`local-genfeedai`)** — cheapest. The
   preview's migrate task runs `prisma migrate deploy` into `pr_<n>` schema
   (search_path); dropped on close. Recommended.
2. **Dedicated preview RDS** — cleaner isolation, ~$15-30/mo extra, slower spin-up.
3. **Point previews at staging DB read-mostly** — risky (writes pollute staging).

Default if unspecified: **Option 1** (schema-per-PR on dev RDS).

## Why it's a separate PR

It needs the wildcard cert + listener-rule wiring + the DB-schema lifecycle, and
the DB decision above. Keeping it out of the steady-state migration PR keeps that
PR reviewable and lets the core cutover land first.
