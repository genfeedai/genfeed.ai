---
name: onboarding org from user
description: First-login org/brand is named from the signed-in user; /agent/onboarding sits on their membership org
type: feedback
---

# Onboarding uses the connected user's org

Signup must not create a hardcoded **Default Organization**. The first org and
brand are named from the signed-in user (corporate email domain, display name,
or email local-part). `/agent/onboarding` always sits on that user's membership
org and loads the values already on that org/brand.

**Why:** A leftover stub slug (`default-organization`) next to the seeded
`default` workspace sent first-login and "go back to onboarding" into an empty
org that was not theirs.

**How to apply:**

- `UserSetupService` names new workspaces with `resolveSignupWorkspaceLabel`.
- Reuse an existing membership org. Do not spawn a second stub.
- Proxy onboarding redirects resolve `organizations?mine=true` / bootstrap and
  ignore a stale `gf_ws` slug cookie. A leftover
  `/:wrongOrg/~/agent/onboarding` URL moves to the membership org.
- Prefill and the onboarding conversation read the org/brand already on that
  membership — they do not invent a second workspace.
- If signup persisted a session after UserSetupService threw, the next
  authenticated identity resolve retries provisioning so the user cannot stay
  signed in with zero memberships.
