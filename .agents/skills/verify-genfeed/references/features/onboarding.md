# Onboarding

## What exists
`/onboarding` with steps for brand, corpus, first-system, positioning, post-signup,
providers, success and summary. Also `/login`, `/sign-up`, `/connect`, `/oauth`. A classic
wizard and an expert path both exist; the authed setup marks onboarding complete for the
throwaway user (`PATCH /users/me {isOnboardingCompleted:true}`).

## How a user reaches it
First sign-in redirects to `/onboarding` until `isOnboardingCompleted` is true.

## How to drive it
Specs under `playwright/e2e/tests/onboarding/`: `onboarding`, `onboarding-steps`,
`classic-wizard`, `expert-path`. Page objects: `onboarding.page.ts`,
`expert-onboarding.page.ts`, `login.page.ts`. Real sign-up/session flow:
`playwright/e2e/auth.setup.ts` (project `better-auth-setup`).

## What usually breaks
- Authed runs skip onboarding on purpose; to test it, use the mocked specs or a user that
  has not completed it.
- Mocked tier needs the three bypass layers (cookie, Better Auth client state, API
  mocks) and `setupApiMocks` before `setupBetterAuthMocks`; wrong order lands on `/login`.
- Provider connection steps call external platforms; they are mocked, never real.
