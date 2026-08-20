---
name: nestjs-expert
description: Design, implement, or review NestJS modules, controllers, services, guards, DTOs, and Prisma-backed API behavior in Genfeed.ai.
---

# NestJS Expert

Use this skill for NestJS work under `apps/server/`. Keep framework code at the
adapter boundary and preserve Genfeed's public API, authorization, tenancy, and
serializer contracts.

## Establish the Local Pattern

Before editing:

1. Read the repository `AGENTS.md` and relevant `.agents/memory/` rules.
2. Inspect the owning module, controller, service, and colocated specs.
3. Read at least three nearby implementations of the same kind of change.
4. Reuse the existing DTO, serializer, guard, exception, and module patterns.

Do not introduce a generic NestJS pattern when the owning domain already has a
clear convention.

## Current Stack and Boundaries

- NestJS 11 with strict TypeScript.
- Prisma 7 and Postgres for persistence.
- BullMQ and Redis for asynchronous work.
- Better Auth for identity and session handling.
- Nest decorators belong only in server adapter layers such as controllers,
  gateways, modules, guards, and schedulers.
- Framework-agnostic packages must not import `@nestjs/*`.
- Nest-bearing tsconfig chains must inherit from
  `tsconfig.server.decorators.json`.

## Persistence Invariants

- Use Prisma models and the repository's existing Prisma service boundaries;
  do not add Mongoose schemas, `ObjectId` references, or Mongo query idioms.
- Every tenant-scoped query includes both `organizationId: orgId` and
  `isDeleted: false`. Apply the documented self-hosted single-tenant exception
  only where the existing boundary supports it.
- Use `users.id` as the canonical user foreign key. Never persist an auth
  provider identifier as a database relation.
- Soft deletion uses `isDeleted: boolean`; do not add `deletedAt`.
- Preserve transactions, idempotency, credit accounting, and queue semantics
  when moving persistence logic.

## Transport and Service Design

- Controllers validate and delegate; domain behavior belongs in services.
- Use class-based DTOs and the repository's validation conventions.
- Keep response shaping in `packages/serializers`, not controllers.
- Preserve guards and organization/brand authorization at the current or a
  stronger boundary.
- Use path aliases and respect package boundaries.
- Prefer focused services with explicit dependencies. Do not hide circular
  design behind additional `forwardRef` calls.
- Keep exception categories and externally observable error behavior stable
  during refactors.

## Verification

- Lock changed behavior with the closest deterministic spec before production
  edits when behavior is changing.
- Exercise the shipped controller/service entry point rather than duplicating
  implementation logic in the test.
- Run only verification permitted by the current host policy; let PR CI own
  broader tests, typechecks, and builds when local execution is restricted.
- Review the final diff for tenant scope, soft deletes, serializers, auth,
  queue behavior, and accidental public-contract changes.

## Reject These Patterns

- MongoDB/Mongoose examples or compatibility shims in new code.
- Tenant queries without organization and soft-delete scope.
- Raw Prisma records returned as public responses when a serializer exists.
- Nest decorators in shared framework-agnostic packages.
- Inline response interfaces used to bypass shared contracts.
- Behavior changes disguised as structural cleanup.
