# Media gates: thresholds, live flips and the outage drill

Epic #4877 checks generated media before it is published, in three layers. Each
layer runs off the publish path. The publish path only reads the persisted
results, through `MediaAssessmentService`.

| Layer | What runs | Setting | Default |
| --- | --- | --- | --- |
| Readiness (#4878) | Probe metadata against `PLATFORM_MEDIA_SPECS` | always on | blocks on `error` |
| Perception (#4879) | Frames, OCR, transcript and scene description | `MEDIA_PERCEPTION_ENABLED` | on |
| Moderation (#4880) | Provider scores over frames, transcript and OCR | `MODERATION_PROVIDER`, `MODERATION_MODE` | `none`, `shadow` |
| Vision flags (#4881) | Scorer rubric over the perceived frames | `MEDIA_GATE_VISION_MODE` | `off` |
| Text decisions (#4882) | Typed decisions over the transcript, scene description and caption | `MEDIA_TEXT_GATE_DECISION_MODE` | `off` |

Perception produces inputs and never gates anything on its own. The three gating
classifier layers are moderation, vision and text. Readiness is deterministic.

## Tighten-only

`applyMediaAssessmentToPublishPolicy` can turn a permitted auto-publish into
review-required. It can never permit anything, reject anything, or change a
denial's own reason. With every gate `off` or `shadow` the assessment is empty,
and publish policy behaves exactly as it did before the epic.

- **`shadow`** persists results and logs what would have flagged. Nothing gates.
- **`live`** forces review on a flag.
- **Unchecked media under `live`:** while a classifier gate is `live`, a media
  asset without that gate's result is reported as `perception:checks_pending`
  and goes to review. Unchecked media is never treated as clean.

## Live-flip checklist

Every `shadow` → `live` flip, per layer and per deployment, needs:

1. A benchmark run from `bun run bench:typed-decisions -- --mode=media`,
   against the provider and thresholds that will go live. Link the run output
   in the flip's issue or PR.
2. For moderation, per-category precision and recall. The committed transcript
   set is a wiring floor. A flip also needs the operator-held image manifest
   (`--image-manifest=<path>`, never committed; see the
   [fixture README](../../apps/server/api/test/fixtures/media-gates/README.md)).
3. For text decisions, at least 150 operator-labelled transcripts and 150
   caption/description pairs, with per-question accuracy. The committed sets
   are synthetic starters.
4. A completed outage drill (below) on the target environment, with results
   noted.
5. A week of `shadow` data showing the would-flag rate the team is willing to
   send to review.

## Threshold policy

Thresholds are data, set in configuration, and justified by the calibration
tables the benchmark prints. For each moderation category, and for each text
question's `false` answers, the benchmark prints the **positive-label rate per
score decile** and a **suggested** threshold computed from the rule below.

### Moderation

Moderation thresholds are per category, a minimum score in `0..1`, and set in
`MODERATION_THRESHOLDS`. Lower is stricter.

| Category | Default | Bias |
| --- | --- | --- |
| `sexual_minors` | 0.20 | recall; no false negative is acceptable |
| `self_harm` | 0.40 | recall |
| `hate`, `sexual` | 0.50 | balanced |
| `graphic`, `harassment` | 0.60 | balanced |
| `drugs`, `violence`, `weapons` | 0.70 | precision; common in legitimate brand content |
| `spam` | 0.90 | precision; low harm, high false-positive cost |

**Rule:** a category's threshold is the lowest decile floor from which every
non-empty decile at or above it has a positive-label rate of at least 95%, with
at least 20 labelled positives at or above it. That is the precision a flag
would have if the threshold sat at that floor. The benchmark prints it as
`suggested`.

The recall-biased categories may go lower than the suggestion, but never higher
than their default, without a written decision.

A category the set cannot measure (the benchmark prints `n/a`) keeps its
default and must not be cited as calibrated. The defaults above are provisional
until the first provider run is linked.

**Coverage gap — visual minors.** `sexual_minors` on images is derived: it is
the visual `sexual` score, taken when perception reports `hasSuspectedMinors`.
It is not a dedicated classifier.

### Vision flags

Vision flags are rubric enums with no confidence threshold (`deriveVisionFlags`):

| Rubric value | Flag | Severity | Gates in `live` |
| --- | --- | --- | --- |
| `artifactLevel=severe` | `severe_artifacts` | critical | yes |
| `brandReadiness=not_ready` | `not_brand_ready` | critical | yes |
| `compositionQuality=weak` | `weak_composition` | warning | yes |
| `artifactLevel=minor` | `minor_artifacts` | info | no |
| `brandReadiness=needs_polish` | `needs_brand_polish` | info | no |

Changing which values flag is a contract change, reviewed like code.

### Text decisions

A `false` answer counts at or above `MEDIA_TEXT_GATE_MIN_CONFIDENCE`
(default 0.85). Only `false` answers act, so only they are calibrated: for each
confidence decile, the rate at which the label was also `false`. Apply the same
rule as for moderation, and use the higher suggestion of `isBrandSafe` and
`isOnBrand`. `isCaptionConsistent` only ever warns.

`--min-accuracy` fails a question that has any unanswered case, so a provider
that answers 1 case in 150 cannot pass on that one answer.

## Outage drill

Run the drill before the first Cloud `live` flip, and again after any change to
a gate's failure handling.

### Automated drill (runs in CI)

The CI part of the drill is
`apps/server/api/src/services/media-assessment/media-gates.outage.spec.ts`. It
runs every gate job and the publish-path assessment with all gates `live`,
against two providers:

- `none`, meaning no adapter is bound;
- `timeout`, a stub whose every call times out.

The spec asserts the behaviour in the table below.

The PR tier runs the spec through Vitest `--changed` whenever a gate module it
imports changes. The Full Suite runs it on every push to `master`.

### Manual drill (staging)

1. Put moderation, vision and text decisions in `live` on staging.
2. Block the provider hosts from the API and workers:
   - `api.openai.com` (moderation), the typed-decision provider host, and the
     vision model's gateway;
   - use an egress deny rule, or point `HTTPS_PROXY` at a closed port.
3. Generate an image and a video post, then publish each three ways: manually,
   through the agent publish tool, and through auto-publish.
4. Record what happened against the expected results below, then unblock the
   hosts and confirm the sweeps recover within one lookback window.

### Expected behaviour during a provider outage

| Surface | Expected |
| --- | --- |
| Generation | Unaffected; perception keeps frames, OCR and transcript, and retries the description |
| Manual publish | Unaffected. Only readiness gates it, and readiness is deterministic |
| Publish latency | Unchanged. The assessment reads rows only and never calls a provider |
| Moderation job | Throws; BullMQ retries it (3 attempts, backoff from 60s). No verdict or activity is written |
| Vision job | Records a paid attempt on each try, up to 3 in total; no evaluation is written |
| Text-decision job | Writes nothing, and throws so the job retries with the same backoff |
| Auto-publish and the agent tool | Held for review with "Media checks are still running…"; never rejected |
| Badges and cards | Moderation, vision and text badges are missing; readiness diagnostics still show |

**What "zero user-visible impact" means.** With all gates in `shadow`, a
provider outage is invisible apart from missing badges. With any gate `live`,
the only user-visible effect is that autonomous publishes go to review until
their checks complete. That is the fail-closed choice made in #4881.

**Recovery.** Moderation, vision and text decisions run in one media-gates job
per asset. A failure in any of them fails the job, and BullMQ retries all three
(3 attempts with exponential backoff from 60s). After the last attempt, the
failed job holds the asset's job id for 30 minutes. The sweep then offers the
asset again, as long as it is still inside `MEDIA_PERCEPTION_LOOKBACK_HOURS`.
Moderation and text decisions recover on their own once the provider returns.

Vision does not. Each retry of the shared job spends one of the asset's 3 paid
vision attempts, so an outage of the vision model, or of any other gate while
vision is also failing, exhausts them within minutes. An asset that ran out of
attempts stays `checks_pending` for good while vision is `live`, and needs a
human approval. **Switch vision to `shadow` as soon as an outage is detected**;
waiting it out does not work.

**Failed perception.** When perception's transcript, OCR or scene description
failed for good, the text questions are never asked over what remains, because
that would pass text that was never read. While the text gate is `live`, the
asset stays `checks_pending` and needs a human approval.

**Unbound providers are not outages.** With `MODERATION_PROVIDER=none`, or no
typed-decision provider bound in /admin, that gate classifies nothing new and
never marks media as unchecked, even when its mode is `live`.

Results already stored still apply while the mode is `live`:
- moderation scores from an earlier provider;
- confident text decisions.

Unbinding a provider never loosens the gate for media that was already flagged.
Vision has no unbound state: a `live` vision mode without a working vision model
holds media for review.
