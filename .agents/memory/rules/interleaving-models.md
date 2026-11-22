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
- Code that waits or polls: fake only `Date`, `setTimeout` and `clearTimeout` (the explorer settles on `setImmediate`), reset the clock and clear timers at the start of every schedule, and add an `environment('time passes', () => vi.getTimerCount() > 0, () => vi.advanceTimersByTime(step))`. Put the clock in the snapshot.
- A race the model finds in code that is already fixed goes in an issue, and the model asserts its exact trace beside the issue number until the fix lands; never widen the invariant to hide it.
- Keep a hand-written unit test when it guards behavior the model does not state (security, legal, wire format). Delete one the model subsumes.

Reference: `webhooks.stripe.controller.model.spec.ts` (replays #10800); `apps/server/workers/src/services/thread-comment-delivery.service.model.spec.ts` (replays #10792; a Postgres double that evaluates the sweep's real `where`, and throws on a filter it does not know); `apps/server/api/src/collections/credentials/utils/oauth-verify-claim.util.model.spec.ts` (replays #10824, with time passing; it found the gap #10863 that #10871 closed). `apps/server/workers/src/services/scheduled-post-provider-attempts.model.spec.ts` (no past bug to replay, so mutations of the real code are its proof; the lease clock is an environment, and a statement in flight holds the clock back).
