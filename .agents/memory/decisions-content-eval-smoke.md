---
name: content-eval generation smoke
description: Generation-type registry, org+brand context-injection tests and the capped smoke workflow; known gaps and the paid-call gate
type: project
last_verified: 2026-10-18
---

# Content-eval generation smoke (#4928)

Docs: [content evals](../../docs/content-evals.md).

- `scripts/content-eval/context-coverage/generation-types.ts` maps every
  `GenerationType`, `ContentType` and `IngredientCategory` member to the file
  that puts org + brand context in its prompt. It is part of
  `test:executable-contracts`, so a new generation type needs a row.
- Known gaps (rows marked `GAP:`): agent-chat scripts (brand context assembly,
  no harness brief) and avatar-video speech (caller text sent verbatim), tracked
  in #7868. Newsletter drafts compose the harness brief and fail with a
  retryable 503 instead of serving a template.
- `.github/workflows/content-eval-smoke.yml`: deterministic lane is free; the
  live lane spends `CONTENT_EVAL_MAX_CREDITS` (hard cap, fail closed). Nightly
  live is opt-in (`CONTENT_EVAL_NIGHTLY=true`) and text-only. It is not a
  release gate; `release.yml` does not reference it.
- No paid run is authorized until Vincent sets the cap variable and secrets
  (paid-call gate, 2026-10-03; #4924). No live quality evidence exists yet.
