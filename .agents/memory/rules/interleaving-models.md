---
name: interleaving-models
description: Code that claims, retries or promotes shared state gets an interleaving model that runs the real code on every PR
type: feedback
last_verified: 2026-11-22
---

A claim, retry or promote protocol over Redis or Postgres gets a model beside the code, named `<file>.model.spec.ts`. It runs the real class against doubles whose every command is a step of `apps/server/api/test/model-checking/interleaving-explorer.ts`, so it tries every order of the steps, a crash before any step and a claim expiring at any moment.

**Why:** The #10791 audit and its fixes found the same mistake in about twenty places: a check followed by a write, a claim kept after a crash, an acknowledgement before the work finished. Each fix came with a test for the one order someone thought of. Two workers run side by side at every deploy, so the orders nobody thought of happen.

**How to apply:**
- Write the harm as an invariant over the doubles' state, not as a call count: "a delivery answered 200 for an event that was never fulfilled".
- Replay the past bug: keep a compact copy of the code before its fix as a second scenario and assert the exact counterexample it fails with. A model that has never failed has not been shown to look.
- Give the scenario a `snapshot` so equal states are explored once; without it three actors of two steps are already 90 schedules.
- Model the crash as a `crashable` actor, never as a thrown error: a crash skips `catch` and `finally`.
- Keep a hand-written unit test when it guards behavior the model does not state (security, legal, wire format). Delete one the model subsumes.

Reference: `webhooks.stripe.controller.model.spec.ts` (replays #10800); `apps/server/workers/src/services/thread-comment-delivery.service.model.spec.ts` (replays #10792; a Postgres double that evaluates the sweep's real `where`, and throws on a filter it does not know).
