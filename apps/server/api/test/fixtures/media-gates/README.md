# Media gate fixtures

Labelled sets for the media-validation gates of epic #4877. They measure the
gates; they are not production data. Thresholds, the live-flip checklist and
the outage drill are in
[docs/operations/media-gates.md](../../../../../../docs/operations/media-gates.md).

## Running the benchmark

```bash
bun run bench:typed-decisions -- --mode=media
```

This prints the readiness results, per-category moderation precision and
recall, accuracy by score decile, and per-question accuracy for the text
decisions. Moderation uses `MODERATION_PROVIDER` / `MODERATION_THRESHOLDS`
from the environment; the text decisions use `--provider` (default `jev`).
Add `--image-manifest=<path>` for the private image set, and
`--skip=readiness,moderation,text` to run a subset. The flags are documented
in `scripts/typed-decisions/media-benchmark.ts`.

## `readiness-samples.fixture.ts`

The readiness samples are not files. They are generated from
`PLATFORM_MEDIA_SPECS`, per platform and kind:

- one compliant probe, which must raise nothing;
- one probe just past every limit the spec sets (minimum, maximum, container,
  codecs, aspect ratio);
- one sample with the probe missing.

The evaluator reads probe metadata, so a probe one step past a limit tests
exactly what an ffmpeg-generated file would, without committed binaries.
Because the samples come from the spec table, a spec edit carries them along.
`media-readiness.fixtures.spec.ts` requires every sample to pass.

## Anonymisation rules

- No customer media, captions, transcripts, names, handles, URLs or brand
  identifiers. Every row is synthetic or taken from a public-domain source and
  says which in `source`.
- No real person is described. Text rows that must carry harmful language use
  the mildest phrasing that still exercises the category.
- **Image sets are never committed.** Labelled images for sexual, graphic or
  minor-safety categories must not live in a public repository. They are kept
  in an operator-held private bucket and referenced by a local manifest passed
  to the benchmark at run time with `--image-manifest=<path>`. It is JSONL,
  one `{ "url": "…", "expected": ["sexual"], "source": "…" }` per image, and
  the URLs must be reachable by the provider.

## `moderation-transcripts.jsonl`

Text rows for the moderation classifier (#4880), scored as `transcript` inputs:

```json
{ "text": "…", "expected": ["harassment"], "source": "synthetic" }
```

`expected` lists every Genfeed `ModerationCategory` the row should flag; an
empty array is a safe row. `sexual_minors` has no text row on purpose.

**Known coverage gap — visual minor safety.** The OpenAI adapter scores
`sexual/minors` for text only. For images and frames the moderation service
raises `sexual_minors` from the visual `sexual` score when perception's scene
description reports `hasSuspectedMinors`, so the strict minors threshold
applies; there is no independent visual minors classifier. A private image
manifest can measure that derived signal, but it is not a substitute for a
dedicated visual classifier, and `live` should not be treated as full visual
minor-safety coverage.

Per-category precision and recall come from
`computeModerationCalibration` (`apps/server/api/src/services/moderation`).
The benchmark's media mode runs this set against the configured provider and
prints them. **No live flip may cite this set alone**: it is a floor for wiring and
regression, sized for coverage, not a statistically meaningful accuracy claim.

## `media-text-transcripts.jsonl` and `caption-description-pairs.jsonl`

Starter sets for the text decisions on perception output (#4882), in the
typed-decision fixture shape — `state` is exactly what
`MediaTextDecisionService` sends, `expected` holds one boolean per question:

```json
{ "state": { "brand": { … }, "transcript": "…" }, "expected": { "isBrandSafe": true, "isOnBrand": false }, "source": "synthetic" }
{ "state": { "caption": "…", "sceneSummary": "…", "subjects": […], "textOnScreen": "…" }, "expected": { "isCaptionConsistent": false }, "source": "synthetic" }
```

They are **synthetic and small** (33 transcripts across three brand profiles,
20 caption/description pairs) and exist so the wiring and the benchmark's
media mode run end to end. The issue's gate for `MEDIA_TEXT_GATE_DECISION_MODE=live`
— at least 150 transcripts and 150 caption/description pairs **labelled by an
operator**, with accuracy reported — is not met by these files and stays open
until an operator-labelled set replaces them.
