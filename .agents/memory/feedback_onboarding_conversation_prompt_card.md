---
name: onboarding conversation prompt card
description: First-login /agent/onboarding is a conversation; compact card sits on the prompt bar
type: feedback
status: active
last_verified: 2026-08-14
topics: [onboarding, agent, composer]
---

# Onboarding is a conversation, not a setup form

First-login (`isOnboardingCompleted: false`) opens the agent conversation at
`/agent/onboarding` on the signed-in user's membership org
(`/:orgSlug/~/agent/onboarding` until a brand exists). The org/brand name
comes from that user — never a hardcoded Default Organization stub. The
signed-in user is already known. The canvas is a conversation.

**Why:** A persona picker plus a second textarea and a "Start with my first
image" CTA is a wizard in the chat surface. It duplicates the composer and
asks who the user is after they have already signed in.

**How to apply:**

- Empty onboarding uses the same empty conversation + inflow prompt bar as
  `/agent/new`.
- A compact hint sits in `PromptBarContainer` `topContent`.
  The composer is the only message input and send control — paste a site
  or type what you make there. Do not add a second URL field.
- Do not add account-type pickers, a duplicate textarea, or a start CTA in
  the transcript.
- Do not mount the workspace inspector on this route (Context rail, mobile
  Conversation/Inspector chrome, or + tabs). Those belong on product canvases
  such as Studio, Library, and Workspace.
---
