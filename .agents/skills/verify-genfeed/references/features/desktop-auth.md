# Desktop and auth

## What exists
Sign-in via Better Auth (`/login`, `/sign-up`, email session cookie, `/auth/token` JWT),
the desktop shell (`apps/desktop`, local surface at `/desktop/local`), and Google sign-in
on the cloud deployment.

## How a user reaches it
Web: `/login`. Desktop: launch the Electron app; the local surface is `/desktop/local`.

## How to drive it
Web auth for a real run is `playwright/e2e/auth.setup.ts`: sign up by email, take the
session cookie, fetch the JWT, mark onboarding complete; the result is saved to
`playwright/artifacts/.better-auth/user.json`. Set `E2E_BETTER_AUTH_SESSION_TOKEN` to reuse
a pre-minted token. Specs: `playwright/e2e/tests/desktop/desktop-local.spec.ts`,
`desktop-runtime-electron.spec.ts`, `playwright/e2e/tests/cloud/google-sign-in.spec.ts`.
The manual desktop checklist is `apps/desktop/RELEASE_QA.md`.

## What usually breaks
- Cookies are host-scoped to the Portless route; drive the same route the API trusts, and
  keep `E2E_API_ENDPOINT` consistent with it.
- Node needs `NODE_EXTRA_CA_CERTS` for the Portless CA or sign-up fails with a TLS error.
- Electron specs need the desktop build and are not part of the web core lane.
- Never put real credentials in specs; the throwaway user is generated per run.
