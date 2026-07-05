# Identity & Request Resolution

How a Better Auth session becomes an authorized, org-scoped API request — and
the legacy hazards to avoid when touching this path. Written for contributors
and coding agents; every path below is a real code location.

## The flow (SaaS / community with auth)

```
Browser cookie (better-auth.session_token, httpOnly)
  │
  ├─ apps/app/proxy.ts ── GET /v1/auth/token (cookie → short-lived JWT)
  │                        └─ JWT `sub` = genfeed User.id
  │
  └─ API request with Bearer JWT
       │
       BetterAuthStrategy.validate()            apps/server/api/src/auth/better-auth/passport/
       ├─ verifyToken(token) → claims
       ├─ BetterAuthIdentityResolverService.resolve(claims.sub)
       │    ├─ BetterAuthIdentityCacheService (Redis) — cache-first
       │    └─ resolveFromDatabase(): User → Members → org/brand pointers
       │         • active org = User.lastUsedOrganizationId, validated against
       │           live membership/ownership (never trusted blindly)
       │         • isSuperAdmin = users.platformRole (user-global, org-independent)
       └─ shapes request.user with a legacy-compatible publicMetadata:
            { user, organization, brand, isSuperAdmin }
```

Two consumers of the result:

- **Controllers** read `getPublicMetadata(user)` (`helpers/utils/auth/auth.util.ts`)
  — the legacy metadata shim. `publicMetadata.user` is the resolved genfeed
  `User.id`, `publicMetadata.organization` the validated active org.
- **`/v1/auth/bootstrap`** (`auth/services/auth-bootstrap.service.ts`) returns
  `access { userId, organizationId, brandId, isSuperAdmin }` to the frontend;
  `apps/app/packages/server/protected-bootstrap.server.ts` maps it into
  `accessState` for layouts (e.g. the `/admin` gate).

Both paths resolve from the same tables. If they ever disagree, suspect a
stale `BetterAuthIdentityCacheService` entry — `invalidateForUser` must be
called on any write that changes a user's org/brand pointers (org create,
org switch, membership changes).

## Caches on this path

| Cache | Keyed by | Invalidation |
|---|---|---|
| `BetterAuthIdentityCacheService` | JWT `sub` (User.id) | `invalidateForUser` on org create/switch, membership writes |
| `AccessBootstrapCacheService` | User.id | same call sites |
| `RequestContextCacheService` | request identity | same call sites |
| `gf_ws` cookie + in-memory map (`apps/app/proxy.ts`) | session cookie | 5-min TTL; HMAC-signed |

When adding a write that changes who a user is or which org/brand they point
at, invalidate **all three** API caches (see `createOrganization` in
`organizations.controller.ts` for the reference call site).

## Legacy Mongo-era hazards (the important part)

The codebase migrated Mongo → Prisma/Postgres. Compatibility shims remain, and
they bite in two specific ways:

### 1. `*Document` alias fields are types, not data

`MemberDocument` (and friends) extend the Prisma row type with **optional**
legacy aliases: `_id`, `organization`, `user`, `role`. These exist so old
call sites type-check. **Prisma rows do not populate them** — the live fields
are the scalar FKs: `organizationId`, `userId`, `roleId`.

- Reading `row.organization` compiles and returns `undefined` at runtime.
- Write new code against the scalar FKs. When consuming rows defensively, use
  `row.organizationId || row.organization` (the resolver's
  `getMemberOrganizationId` pattern).

### 2. Filters are mapped, and dropped filters widen queries

`BaseService.processSearchParams` maps legacy filter keys (`user` → `userId`,
`organization` → `organizationId`, `_id` → `id`/`mongoId`), and
`normalizeWhere` **drops `undefined` values**. Consequences:

- `find({ user: id })` works — the alias is mapped before Prisma sees it.
- `findOne({ _id: undefined })` used to normalize to an **unscoped
  `findFirst`** and return the first row in the table — a cross-tenant read.
  `BaseService.findOne` now guards this: an explicitly-passed `_id`/`id` that
  is `undefined`/`null`/`''` returns `null` without querying.
- The same widening applies to any optional filter: `{ organization: undefined }`
  means "all orgs", not "no org". That is load-bearing for single-tenant
  (community) mode — do not "fix" it globally; scope queries explicitly at the
  call site when tenancy matters.

Case study (2026-07): the org switcher showed another account's organization,
duplicated, with two active checkmarks. Root cause: `findMine` mapped
`member.organization` (undefined) → `findOne({ _id: undefined })` → first org
in the table, once per membership row. Fixed by mapping `organizationId`,
dedup, and the `findOne` id-guard.

## Multi-tenancy invariants

- Org enforcement lives in the OSS API: `CombinedAuthGuard` (global) +
  inline `{ organizationId, isDeleted: false }` filters (see #1093).
- `isSuperAdmin` comes from `users.platformRole` and is **org-independent**:
  a superadmin keeps `/admin` access whatever org/brand the URL points at
  (`apps/app/app/(protected)/admin/layout.tsx` gates on
  `accessState.isSuperAdmin`; the app-switcher shows the Administration
  section on the same flag).
- Soft deletes are `isDeleted: boolean`; every tenant query filters it.

## Production runtime access (for debugging sessions)

- Backend runs on ECS Fargate (`genfeed-production`, us-west-1); RDS
  (`genfeed-data`) and Redis are **VPC-only**. There is no direct DB/Redis
  path from a laptop, and ECS Exec is disabled on the `api` service.
- Practical implication: debug production identity issues from the **outside
  in** — `/v1/auth/get-session`, `/v1/auth/token`, `/v1/auth/bootstrap`,
  `/v1/organizations/mine` against `api.genfeed.ai` with a real session tell
  you what each resolution path believes. Disagreement between them localizes
  the bug (cache vs resolver vs endpoint query).
- Deploys: `Deploy ECS (production)` workflow, dispatch-only, master-only.
  See `.agents/memory/reference_prod_aws_runtime.md` and
  `.agents/memory/reference_postgres_rds.md`.

## Related documents

- [Better Auth Organization Bridge](./better-auth-organization-bridge.md) —
  ownership boundary between Better Auth org compat and Genfeed domain rows
- [Platform Admin Role](./platform-admin-role.md) — `users.platformRole`
- [Deployment Modes](./deployment-modes.md) — SaaS / Community / Desktop axes
- [ADR-DEPLOYMENT-MODES](../.agents/memory/architecture/ADR-DEPLOYMENT-MODES.md)
