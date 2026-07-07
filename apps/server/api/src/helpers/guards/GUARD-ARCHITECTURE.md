# Guard Architecture

## Guard Hierarchy

All endpoints are protected by `CombinedAuthGuard`, registered as the global `APP_GUARD` in `app.module.ts`. Controllers do NOT add auth guards manually.

```
Request
  |
  v
CombinedAuthGuard (global APP_GUARD)
  |-- @Public() route? --> allow immediately
  |-- local mode?      --> inject local identity
  |-- Bearer gf_*?    --> ApiKeyAuthGuard (API key auth)
  |-- otherwise        --> BetterAuthGuard (Better Auth JWT/session auth)
```

## Authentication Flow

1. **Public routes**: `CombinedAuthGuard` checks for `IS_PUBLIC_KEY` metadata via `Reflector`. If `@Public()` is present on the handler or class, the request passes with no auth.

2. **Local mode**: Self-hosted/local deployments can skip cloud auth and receive the default local org/user/brand identity. Routes annotated with `@RequiresCloudAuth()` still require a valid cloud token.

3. **API key (`gf_` prefix)**: Token extracted from `Authorization: Bearer gf_...` header. `ApiKeyAuthGuard` validates the key against the database, checks IP restrictions, rate limits, and required scopes (via `@ApiKeyScopes()` decorator). Attaches synthetic `request.user` with org/scopes context.

4. **Better Auth (default)**: Non-API-key bearer tokens are validated by `BetterAuthGuard`, which verifies Better Auth JWT/session state and attaches the authenticated Genfeed user context to `request.user`.

## @Public() Decorator

Defined in `packages/libs/decorators/public.decorator.ts`:

```ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

Apply `@Public()` to a controller class or individual handler to bypass all authentication. Use it for webhooks, public content endpoints, health checks, and RSS feeds.

## Guard Types

| Guard | Directory | Purpose |
|-------|-----------|---------|
| `CombinedAuthGuard` | `combined-auth/` | Global APP_GUARD; routes to Better Auth, local identity, or API key auth |
| `BetterAuthGuard` | `auth/better-auth/guards/` | Better Auth JWT/session validation |
| `ApiKeyAuthGuard` | `api-key/` | API key (`gf_*`) validation with IP/rate-limit/scope checks |
| `AdminApiKeyGuard` | `admin-api-key/` | Server-to-server auth via `GENFEEDAI_API_KEY` env var |
| `RolesGuard` | `roles/` | Organization membership and role-based access (uses `@Roles()`) |
| `SubscriptionGuard` | `subscription/` | Requires active Stripe subscription (active or trialing) |
| `CreditsGuard` | `credits/` | Checks org credit balance against model cost (uses `@Credits()`) |
| `MemberCreditsGuard` | `member-credits/` | Extends `CreditsGuard`; also checks seat count vs org limit |
| `ModelsGuard` | `models/` | Validates model key against allowed models for a category |

## Common Patterns

**Do NOT manually add auth guards to controllers.** `CombinedAuthGuard` is global, so every endpoint is authenticated by default.

```ts
// CORRECT: just use the controller, auth is automatic
@Controller('posts')
export class PostsController { ... }

// CORRECT: opt out of auth for public endpoints
@Public()
@Controller('public/posts')
export class PublicPostsController { ... }

// CORRECT: layer additional guards for authorization
@UseGuards(RolesGuard)
@Roles(MemberRole.ADMIN, MemberRole.OWNER)
@Controller('settings')
export class SettingsController { ... }

// WRONG: do not add BetterAuthGuard manually, it's redundant
@UseGuards(BetterAuthGuard) // <-- unnecessary
@Controller('posts')
export class PostsController { ... }
```

Authorization guards (`RolesGuard`, `CreditsGuard`, `SubscriptionGuard`, `ModelsGuard`) are applied per-controller or per-handler via `@UseGuards()` because they enforce business rules beyond authentication.
