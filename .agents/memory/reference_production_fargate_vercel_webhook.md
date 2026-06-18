---
name: Production Fargate + Vercel webhook
description: Live ECS service state and Vercel webhook/Discord notification wiring
type: reference
last_verified: 2026-06-18
---

# Production Fargate + Vercel Webhook

Live production has moved at least partly onto ECS/Fargate.

## ECS production

- Region: `us-west-1`
- Cluster: `genfeed-production`
- Running core services: `api`, `workers`, `files`, `mcp`, `notifications`
- Parked bot/services: `discord`, `slack`, `telegram`, `clips` have `desired=0`, `running=0`
- Terraform source: `infra/terraform/genfeed-prod`

## Vercel webhook receiver

- Public endpoint: `https://api.genfeed.ai/v1/webhooks/vercel/callback`
- Code path: `apps/server/api/src/endpoints/webhooks/vercel`
- `VERCEL_WEBHOOK_SECRET` exists in `/genfeed/production` SSM and is injected into the `api` and `notifications` task definitions.
- Do not add a separate `VERCEL_DEPLOYMENT_NOTIFICATIONS_ENABLED` env switch. Vincent rejected the extra env variable on 2026-06-18; pause by removing/not creating the Vercel webhook or by leaving Discord bot/channel config absent.
- Smoke check on 2026-06-18: `https://api.genfeed.ai/v1/health` returned `{"service":"api","status":"ok",...}` and an intentionally invalid Vercel webhook signature returned `401`.

## Discord notification sink

- The Vercel webhook parses deployment events and publishes `discord:vercel_notification` through Redis. Discord posting still requires configured Discord bot/guild/channel settings.
- `apps/server/notifications/src/services/discord/discord.service.ts` sends Vercel deployment embeds through the bot-managed `Deployments` webhook, configured by `DISCORD_CHANNEL_ID_DEPLOYMENTS`.
- `sendChromaticNotification()` remains a no-op.
- Production SSM/task definitions do not include `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, or Discord channel IDs, so Discord posting is disabled even with the deployment sink implemented.
- Old EC2 Docker also had `genfeed-ai-discord` and `genfeed-ai-notifications` containers running, but container/env inspection showed no `DISCORD_*` env names and logs contained `Discord service is not configured - notifications disabled` / `Discord bot not configured - notifications disabled`.

## Vercel webhook scope

The Ship Shit Vercel team has many non-Genfeed projects. A webhook scoped to "All Team Projects" will receive unrelated project events.

Known Genfeed project IDs from the connected Vercel app / GitHub vars:

- `genfeed.ai`: `prj_77xnWYm4Fp3ngF1SpeuF5lwhOG7I`
- `docs.genfeed.ai`: `prj_SdDiBAjBgxhqmsbDBZ6mmIOAnqUL`
- `app.genfeed.ai`: `prj_1iMHTqANXgCLd3wALOFcWNtgrdAc`
- `admin.genfeed.ai`: `prj_r6dCcREdIfYOlQhIrUZd7K66wVt9`
- `chatgpt.genfeed.ai`: `prj_00kRv957hjA0QZvvRHKs6L0DaDRP`
- `marketplace.genfeed.ai`: `prj_Ai18wq7yeWFy02jLGu0ulq1pfexS`

As of 2026-06-18 only `ENABLE_WEBSITE_VERCEL_DEPLOY=true` is set in GitHub repo vars; docs has a project ID but no matching enable var listed. Avoid including stale app/admin/chatgpt/marketplace projects unless they are deliberately re-homed.

## Correct reset shape

If Vercel deployment notifications are needed again:

1. Re-enable the Discord sink first: add required `DISCORD_*` SSM params, including `DISCORD_CHANNEL_ID_DEPLOYMENTS`, and keep the standalone `discord` ECS service off unless product bot behavior is needed. Deployment notifications are handled by the `notifications` service.
2. Delete any Vercel account webhook scoped to "All Team Projects" for `https://api.genfeed.ai/v1/webhooks/vercel/callback`.
3. Recreate a Vercel webhook on team `team_hFVCbNU4RnfEpQOeSWRxmhEJ`, scoped only to the intended Genfeed project IDs, and only deployment events.
4. Store the new Vercel webhook secret in SSM `/genfeed/production/VERCEL_WEBHOOK_SECRET`.
5. Roll `api` and `notifications` from `master` via the production deploy path.

## Token location

`VERCEL_TOKEN` is not a runtime app secret and is not present in SSM. It exists as a GitHub Actions secret for CI deploys. Local agents cannot read that secret value, so live Vercel webhook creation/deletion requires either a local `VERCEL_TOKEN`, a logged-in Vercel CLI/dashboard session, or a GitHub Actions workflow that uses the secret.
