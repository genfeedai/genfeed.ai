# Regression Risks — Clip Orchestrator Pipeline

This document catalogues the key areas where regressions in the clip pipeline
would cause user-visible breakage, silent data loss, or security issues.

---

## 1. Orchestrator State Machine Regresses

**What breaks:**
- Clips get stuck in intermediate states (`generating`, `merging`) with no
  path to `done` or `failed`.
- Users see perpetual spinners / "processing" indicators that never resolve.
- Retry logic may enter infinite loops if `Failed → <retry-state>` transitions
  are removed.

**Impact:** High — users cannot complete clip creation; support tickets spike.

**Detection:**
- Unit tests on `VALID_TRANSITIONS` map coverage.
- Integration tests that exercise every happy path and every failure→retry path.
- Monitoring alert on clip runs older than N minutes still in non-terminal state.

**Mitigation:**
- `clip-run-state.enum.ts` has an explicit `VALID_TRANSITIONS` map; any
  change to this map must update corresponding tests.
- Observer service tracks `updatedAt` — stale runs can be detected.

---

## 2. Merge Service Fails Silently

**What breaks:**
- Multi-clip projects produce only partial output (first clip only) without
  any error surfaced to the user.
- The pipeline advances to reframe/publish with an incomplete asset.
- Published content is visibly wrong (missing segments, abrupt cuts).

**Impact:** Critical — silent data corruption in user-facing output.

**Detection:**
- Merge step observer must transition to `failed` (not `done`) when the
  underlying merge HTTP call returns a non-2xx status or times out.
- Integration test: `merge service returns error → step status is failed`.
- Health check: compare expected clip count vs merged output duration.

**Mitigation:**
- Never swallow errors in the merge service call.
- Observer emits `failed` with `retryable: true` on transient errors.
- Pipeline must NOT advance past merge unless step status is `done`.

---

## 3. Portrait Conversion (Reframe) Fallback Is Removed

**What breaks:**
- Clips intended for portrait-first platforms (TikTok, Reels, Shorts) are
  published in landscape format.
- Aspect ratio mismatch causes black bars, cropped content, or rejection
  by platform upload APIs.
- Users on mobile see poorly framed content.

**Impact:** High — content quality degradation on primary distribution channels.

**Detection:**
- Integration test: `reframe step produces portrait output URL`.
- Regression test: removing reframe fallback causes test failure.
- Output validation: assert aspect ratio metadata on completed clips.

**Mitigation:**
- Reframe step should have a fallback (e.g., basic center-crop) if the
  AI-powered reframe model is unavailable.
- Never skip reframe silently — if skipped, observer must record `skipped`
  status so the UI can warn the user.
- Platform-specific validators should reject landscape assets for
  portrait-only destinations.

---

## 4. Observer Event Emission Breaks

**What breaks:**
- Frontend progress indicators stop updating (websocket/SSE consumers
  receive no events).
- Users have no visibility into clip run status; appears as if nothing
  is happening.
- Activity feeds / notification dropdowns show stale data.

**Impact:** Medium — functional but poor UX; users may duplicate runs
thinking the first one failed.

**Detection:**
- Observer spec: assert event emission on every status transition.
- E2E: subscribe to events and verify receipt during a full pipeline run.

**Mitigation:**
- Observer service is the single source of truth for step progress;
  it should never be bypassed by direct state mutations.
- Event emission is synchronous with state update — if state changes,
  an event fires.

---

## 5. Confirmation Gate Bypassed

**What breaks:**
- Clips that require user review before publishing go directly to
  `publish-handoff` without approval.
- Users lose editorial control; auto-published content may be
  incorrect or brand-unsafe.

**Impact:** High — trust and brand safety.

**Detection:**
- Integration test: confirm `publish-handoff` stays `pending` when
  `confirmationGate` is enabled.
- State machine: `Reframing → Publishing` must route through
  `AwaitingConfirmation` when the flag is set.

**Mitigation:**
- `CONFIRMATION_CHECKPOINTS` set in `clip-run-state.enum.ts` must
  be respected; changes require test updates.
- Observer tracks confirmation state; UI blocks publish button until
  confirmation is received.

---

## 6. Tenant Isolation Violation

**What breaks:**
- Organisation A can view or modify Organisation B's clip run progress.
- Leaked content, preview URLs, or generation metadata across tenants.

**Impact:** Critical — security / data privacy breach.

**Detection:**
- Integration test: separate org runs are completely isolated.
- API layer: clip run endpoints must filter by `organizationId`.

**Mitigation:**
- Observer keys runs by `clipRunId` which is globally unique.
- API controllers must validate ownership before returning progress.
- Never expose raw run IDs in URLs without auth checks.
