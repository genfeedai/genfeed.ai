---
name: shared onboarding brand step
description: `/onboarding/brand` is the shared first step for Cloud and Desktop; Skip completes the gate but brand stays re-enterable
type: feedback
status: active
last_verified: 2026-08-24
topics: [onboarding, brand, desktop]
---

# Shared brand setup, re-enterable after Skip

Every surface uses `/onboarding/brand` first: Cloud browser, Community, Desktop-cloud, and Desktop-local. One form (`brand-content.tsx`) and one routing helper (`resolveOnboardingContinueHref` / `resolveForcedOnboardingHref`) drive both workflows.

**Skip** still marks `isOnboardingCompleted: true` so the gate does not force onboarding again. The operator can open `/onboarding/brand` later (journey card, `/onboarding` replay) and update the existing membership brand — never a second stub.

**Why:** Generation quality needs a confirmed default brand (name, URL scrape, voice). Signup prefill is silent and corporate-email only. The agent conversation is the *post-brand* Cloud path, not a replacement for the form.

**How to apply:**

- Do not redirect signed-in Cloud users away from `/onboarding/brand`.
- After brand continue: Cloud / Community → `/{org}/~/agent/onboarding`; Desktop → `/onboarding/providers`.
- Desktop local login goes to `/onboarding/brand`, not `/desktop/local`.
- Skip completes the gate. Do not hide or block `/onboarding/brand` after that.
