# Auth client

The first-party Better Auth client for Genfeed (`@genfeedai/auth-client`, private workspace package). It mounts the browser client against the API's auth handler at `/v1/auth/*` and gives the apps one place to read the session and the API token.

## Entry points

- `.` (`src/index.ts`) re-exports the four modules below.
  - `client`: the singleton Better Auth browser client (magic link, JWT and admin plugins).
  - `config`: resolves the auth base URL and the feature switches (`isBetterAuthEnabled`, `isMagicLinkAvailable`, `isGoogleSignInAvailable`). It names `NEXT_PUBLIC_API_ENDPOINT`, `BETTER_AUTH_ENABLED` and `NEXT_PUBLIC_BETTER_AUTH_ENABLED` and reads no secrets.
  - `session`: the `AuthIdentity` shape and the token helpers used outside React.
  - `session-keep-alive`: keeps the session store subscribed so the session request is not refired on every remount.
- `./callback`: validates the post-login continuation and builds the browser and magic-link callback URLs.
- `./react`: `BetterAuthProvider`, `useAuth` and `useAuthClient`.
- `./server`: fetches the Bearer JWT from the `/token` endpoint for server components, forwarding the request's session cookies.
- `./themes`: the auth UI theme placeholder.

## Tests

```bash
cd packages/auth-client && bunx vitest run --config vitest.config.ts
```
