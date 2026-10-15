---
name: Self-host local identity gate
description: The seeded local admin is a login-off convenience limited to loopback/Docker peers; login on means no tokenless API request, ever
type: project
last_verified: 2026-10-15
---

`CombinedAuthGuard`, `LocalIdentityInterceptor` and `RequestContextMiddleware` share one gate,
`isLocalIdentityPeer` (`apps/server/api/src/helpers/utils/local-identity/`).

**Why:** the API on 3010 used to resolve tokenless requests to the seeded `admin@localhost`, even with
`BETTER_AUTH_ENABLED=true`, so anyone who could reach the port got the local user (refs #6965). The
decision was to derive behavior from the existing `BETTER_AUTH_ENABLED` flag and `TRUST_PROXY`, not add env vars.

**How to apply:**
- `BETTER_AUTH_ENABLED=true`: every request needs a token (Better Auth JWT or `gf_` API key). Never inject the local identity or hydrate the self-hosted default context.
- Login off: inject the local identity only when `request.ip` (Express `trust proxy`, i.e. `TRUST_PROXY`) is loopback or in `172.16.0.0/12`, and no untrusted `X-Forwarded-For` / `X-Real-IP` / `Forwarded: for=<client>` is present. Other peers need a valid API key.
- `Forwarded: for=unknown` is what the app server and internal services send; it is not a remote client.
- Keep the API host port loopback-bound in Compose. Docker port NAT may look like a trusted bridge peer without forwarding headers; the peer gate cannot distinguish it. Loopback isolation requires Docker Engine 28 or newer. Public reverse proxies require the login wall.
- Admin routes keep `RolesGuard` (`superadmin`) plus the `ADMIN_ALLOWED_IPS` binding. Do not add a new allowlist.
