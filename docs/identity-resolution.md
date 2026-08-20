# Identity & Request Resolution

How a Better Auth session becomes an authorized, org-scoped API request.
Written for contributors and coding agents; every path below is a real code
location.

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
       └─ shapes request.user as AuthenticatedUser
            { userId, organizationId, brandId, isSuperAdmin }
```

Two consumers of the result:

- **Controllers** read canonical fields on `request.user`
  (`user.userId`, `user.organizationId`, `user.brandId`, `user.isSuperAdmin`)
  via `extractRequestContext` in `helpers/utils/auth/auth.util.ts`.
  `user.userId` is the resolved genfeed `User.id`; `user.organizationId` is the
  validated active org.
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

## Canonical persistence identity

Prisma/PostgreSQL IDs and scalar foreign keys are the only persistence
identity contract:

- Use `id`, never `_id` or `mongoId`.
- Use scalar foreign keys such as `organizationId`, `userId`, `brandId`, and
  `roleId`; relation names are reserved for actual Prisma relation objects.
- Scope tenant reads explicitly with `organizationId` and `isDeleted: false`.
- Never pass an optional ID into a lookup until it has been validated. Prisma
  filter normalization drops `undefined` values, so an omitted tenant or entity
  ID can otherwise broaden a query.

The architecture relation-boundary guards enforce these rules in CI.

Request identity is `AuthenticatedUser` (`userId` / `organizationId` /
`brandId` / `isSuperAdmin`) on `request.user`. Do not nest those fields under
Clerk-shaped `publicMetadata`.

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

- Hosted backend and data services are private production infrastructure. There
  is no supported direct production database or cache path from a contributor
  laptop.
- Practical implication: debug production identity issues from the **outside
  in** — `/v1/auth/get-session`, `/v1/auth/token`, `/v1/auth/bootstrap`,
  `/v1/organizations/mine` against `api.genfeed.ai` with a real session tell
  you what each resolution path believes. Disagreement between them localizes
  the bug (cache vs resolver vs endpoint query).
- Hosted deployment jobs, OpenTofu, and ECS scripts run from the public
  `genfeedai/genfeed.ai` `Deploy hosted SaaS` / `Release` workflows. Fleet
  and managed inference operations stay outside this repository.

## Related documents

- [Better Auth Organization Bridge](./better-auth-organization-bridge.md) —
  ownership boundary between Better Auth org compat and Genfeed domain rows
- [Platform Admin Role](./platform-admin-role.md) — `users.platformRole`
- [Deployment Modes](./deployment-modes.md) — SaaS / Community / Desktop axes
- [ADR-DEPLOYMENT-MODES](../.agents/memory/architecture/ADR-DEPLOYMENT-MODES.md)
