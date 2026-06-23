# genfeed-ai

## What this codebase does

Genfeed.ai is a self-hostable AI content creation OS. It is a Bun/Turborepo TypeScript monorepo with NestJS backend services, Next.js/React web apps, Electron desktop, Expo mobile, MongoDB persistence, Redis/BullMQ queues, and shared `@genfeedai/*` packages for workflows, integrations, serializers, UI, and contracts.

## Auth shape

- legacy auth provider is the primary user auth provider, but MongoDB `users._id` is the canonical DB foreign key; `authProviderId` must not be used as a DB foreign key.
- Nest controllers commonly use `@CurrentUser()`, `UseGuards(...)`, request-context middleware, and service-layer ownership checks.
- Enterprise multi-tenancy lives under `ee/`; EE queries must include organization scope plus `isDeleted: false`.
- API responses should flow through serializers in `packages/serializers`, not raw Mongoose documents or ad hoc controller shaping.
- Runtime config should go through Nest `ConfigService`; direct `process.env` usage in backend service logic is suspicious.

## Threat model

Highest-impact attackers try to cross tenant or brand boundaries, exfiltrate integration/OAuth/API secrets, spend credits or queue GPU/AI jobs without authorization, or abuse publishing/webhook paths to reach internal services. The riskiest paths are workflow execution, scheduled jobs, file/media ingestion, social platform integrations, BYOK/provider keys, desktop/extension IPC, and enterprise billing/organization code.

## Project-specific patterns to flag

- Any EE data access missing both organization scoping and `isDeleted: false`.
- Any controller/service returning DB records without a `packages/serializers` serializer boundary.
- Any query or job accepting brand, workflow, ingredient, model, integration, task, or thread IDs without proving current user/org ownership.
- Any outbound webhook, provider URL, or social integration callback that accepts user-controlled URLs or headers without allowlists/private-IP blocking.
- Any logging or API response that can expose tokens, webhook secrets, BYOK keys, OAuth refresh tokens, cookies, or provider credentials.

## Known false-positives

- `*.spec.ts`, `*.test.tsx`, fixtures, and mocks often contain fake tokens, webhook URLs, ObjectIds, and localhost URLs.
- `packages/interfaces`, `packages/enums`, and contract-only packages define fields such as `organizationId`, `token`, or `secret` without performing access control.
- Open-source single-tenant code may intentionally omit organization filters; strict tenant enforcement is expected under `ee/`.
- Docker examples, `.env.example`, docs, and setup guides may contain placeholder credentials or localhost URLs.
- Public marketing/docs routes and intended webhook receiver endpoints should not be treated as authenticated user data APIs by default.
