# Content evals

`scripts/content-eval` measures generated content against the org and brand
context it was generated with. It is separate from `scripts/agent-eval`, which
checks agent task contracts and assesses no model quality.

## What is tested, and what it costs

| Layer | What it proves | Model calls | Where it runs |
| --- | --- | --- | --- |
| Generation-type registry (`context-coverage/generation-types.ts`) | Every `GenerationType`, `ContentType` and `IngredientCategory` member has a row saying how brand context reaches its prompt, and the source file still does it. A fixed gap or a new type fails until the row is updated. | none | `bun run test:executable-contracts` (PR gate) |
| Context injection (`context-coverage/context-injection.test.ts`) | For every harness content kind and surface, the org directive, brand voice, guardrails, criteria and examples are in the formatted prompt, and a second tenant's context never is. Uses the real `buildHarnessInput`, built-in packs and `formatHarnessBrief`. | none | same |
| Smoke (`smoke/`) | Text kinds as raw prompt vs org + brand guidance on one cheap model with a cross-family judge, plus the public benchmark's image and video tasks through the product API. | stub or live | `.github/workflows/content-eval-smoke.yml` |
| Judge calibration, ladder, harness A/B, media ladder | The older suites under `--suite=`. See the header of `run.ts`. | stub or live | by hand |

## Smoke run

```bash
bun run eval:content:smoke -- --max-credits=300            # stub, free
bun run eval:content:smoke -- --max-credits=300 --dispatcher=live
```

- `--max-credits` is required. 1 credit is $0.01. The plan splits the cap
  across cells (text 10%, image 40%, video 50%, renormalised over the cells
  you select), and each suite aborts with a partial report at its own share, so
  the run can never spend more than the cap. Below 20 credits the run is
  refused.
- `--mediums=text,image,video` selects cells. The nightly lane runs `text`.
- Live image and video cells need `CONTENT_EVAL_GENFEED_API_URL`,
  `CONTENT_EVAL_GENFEED_API_KEY` and `CONTENT_EVAL_KELDER_BRAND_ID` (an
  eval-org API key and the synthetic Kelder brand). Without them a cell is
  reported `skipped`, never passed; add `--require-all=true` to fail on it.
- The text fixture is `apps/server/api/test/fixtures/content-evals/smoke/text.synthetic.jsonl`:
  two rows for each smoke text kind, all fictional KELDER data. Real-brand rows
  stay in the private `genfeedai/harness` repo (`CONTENT_EVAL_PRIVATE_FIXTURES`).

## Noise-aware reports

Every ladder and harness A/B report carries a `noise` section, so a score gap
is never read without its variance.

```bash
bun run eval:content -- --suite=ladder --fixture=<jsonl> --models=<baseline>,<challenger> \
  --judge=<key> --max-credits=<n> --repeats=3
```

- `--repeats` (1 to 10, ladder and harness A/B only) answers each case that
  many times per contestant, each repeat with its own generation seed. Repeats of
  one case are averaged first, so the interval is over cases: more repeats
  tighten the per-case score, not the number of independent prompts.
- Per contestant: mean, 95% t-interval, and the pooled repeat sd.
- Per challenger: a paired difference against the baseline. A winner is named
  only when the whole interval is on one side of zero; otherwise the verdict is
  `within-noise` with no winner, and with fewer than two paired cases it is
  `insufficient-data`.
- Diagnostics: a baseline at or above 95% warns (no headroom; compare cost at
  parity); a case that fails in every repeat for every contestant is flagged as a
  suspected task or grader defect; generation and judging failures and timeouts
  are counted apart and never enter the scores; with `--repeats` above 1, six
  outputs are graded a second time and the share whose accept verdict changed is
  reported (their judge calls count against the cap, not against a contestant).
- A repeat count whose projected spend (every generation at its token cap, a few
  hundred tokens per judge verdict) exceeds `--max-credits` is refused before the
  first provider call. The ledger still stops a run at the cap.
- Not covered: cut-off output is not detected separately.

## CI

`content-eval-smoke.yml` has two lanes and is never a release gate.

- **Deterministic** (free, every trigger): harness tests, `genfeedai/benchmark`
  validation and ladder recompute, proof that the pinned media task pack
  matches the benchmark checkout, and a stub run of every cell.
- **Live** (paid): a manual check. Run it with `workflow_dispatch` and
  `dispatcher=live`; it never runs after a Release. It also runs nightly only
  when the repository variable `CONTENT_EVAL_NIGHTLY=true` (text only, a third
  of the cap). It never spends without `CONTENT_EVAL_MAX_CREDITS` and the
  `CONTENT_EVAL_OPENROUTER_API_KEY` secret: a dispatch fails when either is
  missing, and the opt-in nightly skips with a notice (no provider call).

Repository settings the live lane reads: variable `CONTENT_EVAL_MAX_CREDITS`,
secret `CONTENT_EVAL_OPENROUTER_API_KEY`, and for media cells variables
`CONTENT_EVAL_GENFEED_API_URL`, `CONTENT_EVAL_KELDER_BRAND_ID` and secret
`CONTENT_EVAL_GENFEED_API_KEY`.

## Adding a generation type

1. Add a row to `GENERATION_TYPES` with the enum members it covers, the file
   and marker that compose brand context, and `path`.
2. A type that does not compose brand context is a `GAP:` row (`none` or
   `brand-voice-summary`). The test fails when the gap is later fixed, which is
   the prompt to promote the row to `harness` or `generation-brief`.
3. For a text kind, add two rows to the smoke fixture. For image or video, the
   existing media cells cover it.
