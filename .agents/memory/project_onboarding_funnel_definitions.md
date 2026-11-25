---
name: onboarding funnel definitions
description: One meaning of onboarding "completed", the separate "activated" step, and what `partial` means for first-run drafts
type: project
---

"Completed" is the organization flag OR the owner's flag, in one helper (`isOnboardingCompleted`, `endpoints/admin/onboarding-funnel/onboarding-funnel.util.ts`). The organizations report and the funnel both use it. "Activated" is a separate funnel step: the organization has spent a credit (a `deduct` ledger row). A completed account that never activated finished the wizard and never used the product.

First-run drafts `status` is `partial` from the first saved draft until every campaign image is `ready`, so `partial` alone does not mean failure; read `campaignImages[].status`.

**Why:** a 2026-11-23 audit of prod sign-ups found two disagreeing "completed" counts, many completed accounts that never spent a credit, and no run ever `ready`. The last one was a bug: the Nano Banana compiled dispatch carried no resolution tier, so every first-run campaign image failed its quote (#10943).

**How to apply:** report completion and activation from the funnel, never from one flag. A new quote path that prices a model per tier must send the tier it quotes (`NANO_BANANA_DEFAULT_RESOLUTION` in `@genfeedai/contracts/constants`).
