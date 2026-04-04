# Guard Architecture

## Guard Hierarchy

All endpoints are protected by `CombinedAuthGuard`, registered as the global `APP_GUARD` in `app.module.ts`. Controllers do NOT need to add `ClerkGuard` or `ClerkAuthGuard` manually.

```
Request
  |
  v
CombinedAuthGuard (global APP_GUARD)
  |-- @Public() route? --> allow immediately
  |-- Bearer gf_*?    --> ApiKeyAuthGuard (API key auth)
  |-- otherwise        --> ClerkGuard (Clerk JWT auth)
```

## Authentication Flow

1. **Public routes**: `CombinedAuthGuard` checks for `IS_PUBLIC_KEY` metadata via `Reflector`. If `@Public()` is present on the handler or class, the request passes with no auth.

2. **API key (`gf_` prefix)**: Token extracted from `Authorization: Bearer gf_...` header. `ApiKeyAuthGuard` validates the key against the database, checks IP restrictions, rate limits, and required scopes (via `@ApiKeyScopes()` decorator). Attaches synthetic `request.user` with org/scopes context.

3. **Clerk JWT (default)**: `ClerkGuard` extends Passport's `AuthGuard('clerk')` and delegates to `ClerkStrategy`, which calls `verifyToken()` from `@clerk/backend`, derives the request principal from verified session claims on the hot path, and only falls back to `clerkClient.users.getUser()` when required claims are missing. The resulting user-like object is attached to `request.user`.

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
| `CombinedAuthGuard` | `combined-auth/` | Global APP_GUARD; routes to Clerk or API key auth |
| `ClerkGuard` | `clerk/` | Clerk JWT validation via Passport strategy |
| `ApiKeyAuthGuard` | `api-key/` | API key (`gf_*`) validation with IP/rate-limit/scope checks |
| `AdminApiKeyGuard` | `admin-api-key/` | Server-to-server auth via `GENFEEDAI_API_KEY` env var |
| `RolesGuard` | `roles/` | Organization membership and role-based access (uses `@Roles()`) |
| `SubscriptionGuard` | `subscription/` | Requires active Stripe subscription (active or trialing) |
| `CreditsGuard` | `credits/` | Checks org credit balance against model cost (uses `@Credits()`) |
| `BrandCreditsGuard` | `brand-credits/` | Extends `CreditsGuard`; also checks brand count vs org limit |
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

// WRONG: do not add ClerkGuard manually, it's redundant
@UseGuards(ClerkGuard) // <-- unnecessary
@Controller('posts')
export class PostsController { ... }
```

Authorization guards (`RolesGuard`, `CreditsGuard`, `SubscriptionGuard`, `ModelsGuard`) are applied per-controller or per-handler via `@UseGuards()` because they enforce business rules beyond authentication.
