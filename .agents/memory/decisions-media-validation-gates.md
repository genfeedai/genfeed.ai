---
name: media validation gates
description: Three media gate layers (readiness, moderation, vision) plus text decisions; tighten-only publish policy; unchecked media under live goes to review (#4877)
type: project
---

# Media validation gates (#4877)

**last_verified: 2026-09-26** · Operator doc: [docs/operations/media-gates.md](../../docs/operations/media-gates.md)

## Layers

- **Readiness (#4878).** Deterministic, always on. It checks probe metadata
  against `PLATFORM_MEDIA_SPECS`, and an `error` diagnostic blocks every
  publish path. Limits and severities are seed data; the evaluator never
  decides what is fatal.
- **Moderation (#4880).** Provider scores over perceived frames, transcript
  and OCR, behind `IModerationProvider` (`none` | `openai`). It is thresholded
  per category and re-evaluated under the current mode and thresholds when
  assessed.
- **Vision (#4881).** Scorer rubric enums over perceived frames, turned into
  flags by `deriveVisionFlags` and stored on a pre-publication `Evaluation`.
- **Text decisions (#4882)** ride the same assessment: typed decisions over
  the transcript, scene description and caption.

Perception (#4879) only produces inputs. It never gates.

## Rules

- **Tighten-only.** `applyMediaAssessmentToPublishPolicy` may turn PERMITTED
  into review-required. It never permits, never rejects, and never rewrites a
  denial's reason. Every gate `off`/`shadow` ⇒ the policy result is unchanged.
- **The publish path reads rows only.** No classifier or model call happens
  inside `assessPublishMedia`; gate jobs run in workers off the publish path.
- **Unchecked is never clean.** While a classifier gate is `live`, a media
  asset without that gate's result is `perception:checks_pending` and goes to
  review. A provider failure persists nothing, so it cannot read as a result.
- **Unbound means off.** Moderation `none`, or no typed-decision provider
  bound in /admin, makes that gate `off` even when its mode is `live`.
- **Every live flip cites a benchmark run** from
  `bench:typed-decisions -- --mode=media`, and needs a completed outage drill.

**Why:** a gate that loosens, stalls publishing, or treats an outage as a pass
is worse than no gate. Tighten-only plus fail-closed keeps each layer safe to
enable on its own.

**How to apply:** new media checks join `MediaAssessmentService` as another
source of reasons. Never add a separate publish-path branch, and never make a
live provider call on the publish path.
