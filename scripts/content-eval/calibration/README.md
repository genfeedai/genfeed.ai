# Judge calibration (#4924)

The text suite compares both production judges (`content-quality` and
`evaluations`) against human golden labels, with cross-family arms, harness
judges, criteria-injection A/B, rubric alignment, thresholds, a scoring-surface
lock, a CI provenance check with optional calibration evidence, and a cost quote.
Live metrics remain pending paid-call approval and #4923's private fixtures.
Policy approved on 2026-10-10: paid calibration is optional and nonblocking;
scoring-lock integrity and ordinary CI checks remain mandatory. The injection
rule is implemented; its measured keep/drop outcome remains pending.
Vision verdict κ and prompt-length sensitivity are deferred to the #4926 media
golden set and a media re-judge mode. Reports carry `calibration.vision: null`.

## Running the suite

Run from the repository root. `--suite=judge` selects calibration; `--fixture`
accepts comma-separated paths. `--judge` selects harness keys,
`--dispatcher=stub|live` selects the dispatcher, and `--max-credits` sets the
spend ceiling. `--production-judges` defaults to `content-quality,evaluations`.
`--cross-family-judges` adds keys whose family differs from the primary's.
`--brand-context` loads anonymised criteria and examples.
`--calibration-summary-out` writes the summary.

Synthetic stub example:

```sh
OUT="${TMPDIR:?}/4924-verify" && G=apps/server/api/test/fixtures/content-evals/golden
bun run eval:content -- --suite=judge --dispatcher=stub --judge=openai/gpt-5.6-luna --cross-family-judges=openai/gpt-5.6-luna --brand-context=scripts/content-eval/calibration/fixtures/brand-context.synthetic.json --max-credits=100 --fixture=$G/social-post.synthetic.jsonl,$G/thread.synthetic.jsonl,$G/article.synthetic.jsonl,$G/script.synthetic.jsonl,$G/newsletter.synthetic.jsonl,$G/image-caption.synthetic.jsonl --out="$OUT/stub-judge.json" --calibration-summary-out="$OUT/stub-summary.json"; echo "exit=$?"
jq '[.aborted, .fixture.rowCount]' "$OUT/stub-judge.json"
bun scripts/content-eval/calibration/quote.ts --report="$OUT/stub-judge.json" > "$OUT/quote-synthetic.json"
```

Expected: `exit=1` because stub κ is below the threshold by design; jq prints
`[null, 225]`. The summary has `evidenceKind: stub-dispatcher` and the quote
includes `perRowExpectedUsd`. Stub evidence does not measure live judge quality;
linking it produces an advisory warning, not a CI failure or a live-evidence claim.

## Scales and metrics

Scores use `s = (clamp(n) − min) / (max − min)`, rounded to four decimals.

| Scale | min | max | bandCuts | Approve iff n ≥ |
|---|---|---|---|---|
| content-quality (also criteria) | 1 | 10 | `[4, 6, 8]` | 6 |
| evaluations | 0 | 100 | `[25, 50, 75]` | 60 |
| harness-rubric | 0 | 1 | `[0.25, 0.5, 0.75]` | 0.6 |

Human `reviewerScore` maps to `expected.scoreBand` using `floor(score / 25)`
(#4923). For that interval, band =
`min(3, floor(scoreBand.min × 4 + 1e-9))`, point =
`(scoreBand.min + scoreBand.max) / 2`, and decision = `expected.decision`.

Band Cohen κ uses quadratic agreement weights
`w_ij = 1 − (i − j)² / (k − 1)²`, with `k = 4`; unweighted band κ is also
reported. Decision κ is unweighted with `k = 2`. Both use
`κ = (po − pe) / (1 − pe)`, with observed agreement `po` and expected agreement
`pe` from independent marginals. κ is null with no observations or
`|1 − pe| < 1e-12`.

Spearman ρ uses average ranks for ties, then Pearson correlation of the ranks.
It is null for fewer than two observations, unequal vector lengths or zero
variance. `maeToBandMidpoint` is mean absolute error against the human interval
midpoint in 0–1 units. Legacy distance-to-band MAE in `outcome.judges[]` is
unchanged. Metrics round with `Math.round(x * 1e4) / 1e4`.

`thresholds-v2` requires κ ≥ 0.6 (`judgeMinKappa`), 30 rows
(`calibrationMinRows`), position bias ≤ 0.05 and void rate ≤ 0.2. Voids are
excluded from score metrics. Labelled samples with fewer than 30 scored rows
cannot produce a passing κ check.

## Position bias and rubric alignment

Pointwise judges receive one text per stateless call; position bias is
`not-applicable-pointwise`. Harness keys use pairs grouped by kind × brand:
sort approve and reject rows by id, zip to the shorter list, then run each pair
approve-first and swapped, using the approve row's context. `orderedChoice`
measures preference for the same position in both orderings. Failed choices
are omitted from measured pairs; human agreement uses unbiased pairs.
Vision A/B bias is deferred.

| Scorer criterion | Evaluations dimension |
|---|---|
| Hook strength | engagement |
| Clarity & conciseness | technical |
| CTA presence | persuasion |
| Engagement potential | engagement |
| Readability | technical |
| Emotional resonance | persuasion |
| null | brand |

Band equivalence: scorer `<4 / 4–5.x / 6–7.x / ≥8` ↔ evaluations
`0–24 / 25–49 / 50–74 / 75–100` ↔ golden 0.25 bands.

Auto-review candidates are production judges with pooled `scoredDecisionRows`
≥ 30 and `decisionKappa` ≥ 0.6:

- None: `autoReviewJudge` is null, with `no production judge reaches κ ≥ 0.6`.
- One: select it, with `{profileId} is the only production judge with κ ≥ 0.6`.
- Two with |Δκ| < 0.02: select `content-quality`, with
  `tie within 0.02; content-quality stays the consumer`.
- Otherwise: select the higher decision κ, with
  `{profileId} has the higher decision κ`.

This records the recommendation rule; changing the consumer needs a later gated PR.

## Criteria injection

Injection is OFF by default: no production caller passes the optional third
`scoreText` argument. The A/B arm measures this exact `INJECTION_RULE_TEXT`:

```text
keep iff pooled decision kappa delta >= 0.05, pooled band rows < 30 or pooled band kappa delta >= 0, and every kind with >= 30 decision rows has decision kappa delta >= -0.05; insufficient when pooled decision rows < 30; otherwise drop; a null delta fails its condition
```

Optional calibration does not authorize enabling injection or changing its
measurement rule. An enabling PR must cite the measured rule outcome and retain
valid scoring provenance. No keep/drop outcome is claimed before the live run.

## Cost quote

`quote.ts --report={path} --evaluations-prompt-allowance={n}` prices only judge
calls. The allowance defaults to 3000 prompt tokens, added only to
`evaluations-stub` calls for the DB system template and persuasion rubric.
Expected completion tokens use the first rubric-version prefix match:

| Prefix | Expected completion tokens |
|---|---|
| content-quality-scorer | 250 |
| evaluations | 600 |
| content-quality-v1 | 300 |
| autoevals-battle | 300 |
| Other | 300 |

Expected USD uses `catalogueCostUsd(...)`, falling back to
`reservationCostUsd(model, prompt, expected)`. The cap uses
`reservationCostUsd(model, prompt, maxTokens)`, including the retry reserve.
USD rounds to 1e-6. `perRowExpectedUsd` is expected USD divided by row count
(null for zero rows); `recommendedMaxCredits` is
`Math.ceil(usdToCredits(capUsd))`.

The a-priori estimate for ≥600 private rows and about 200 pairs, with
`openai/gpt-5.6-luna` as both harness and cross-family key, is:

| Arm | Estimated cost |
|---|---|
| content-quality@gemini | ≈ $0.08 |
| criteria | ≈ $0.10 |
| evaluations@claude-sonnet-5 | ≈ $7.20 |
| content-quality@luna | ≈ $0.11 |
| evaluations@luna | ≈ $0.40 |
| harness rubric | ≈ $0.14 |
| battles | ≈ $0.11 |
| **Total** | **≈ $8.1 (≈ 815 credits)** |

The cap is about 3×, so the proposed live ceiling is `--max-credits=2500`.
A one-row-per-kind live smoke is approximately $0.10. These are estimates;
live calls need paid-call approval and a fresh quote from the intended fixtures.
The synthetic `quote.ts` command appears in the example above.

## Scoring provenance and optional calibration

After changing a judge model, prompt, decoding or context surface, regenerate
the committed lock:

```sh
bun scripts/content-eval/calibration/scoring-surface.ts --write
```

The CI step never dispatches judges or spends credits. Missing or stale head
locks still fail, including bootstrap and no-base runs. Paid live calibration
is optional; no report is required to merge a scoring change. A changed text or
vision surface without accepted current live evidence emits an honest warning.
Ordinary test, type, build, security and repository protection gates remain required.

If an independently authorized live run is available, commit its summary under
the reports directory and optionally add this line to the PR body, substituting
the summary filename:

```text
Calibration-Report: scripts/content-eval/calibration/reports/{file}.json
```

To be accepted as current live evidence, the summary must match `calibrationSummarySchema`, have
`evidenceKind: live-dispatcher`, and measure the head text digest. It must also
record at least one judge call, a fixture of at least `calibrationMinRows` rows,
the current `thresholdsVersion`, a clean working tree, and, for the primary arm
of each production judge, at least `calibrationMinRows` scored rows that carry a
human band or decision label. Summaries
contain neither row text nor scores. Keep full reports outside the repository.
A missing, unreadable, invalid, stub, stale or incomplete report produces a
warning and is not accepted as current live evidence. A valid current live report
that fails thresholds also produces a warning; its failed measurements remain
unchanged. Optional evidence does not fabricate agreement, passing thresholds or
an injection keep/drop decision. A later PR-body edit can be inspected in a later run.

| Code | Result and condition |
|---|---|
| lock-missing | Fail: head lock is absent |
| lock-stale | Fail: head text or vision digest differs from its surface |
| no-base | Pass: base revision is unavailable |
| bootstrap | Pass: base revision has no lock |
| unchanged | Pass: both digests equal the base |
| vision-unenforced | Pass with warning: only vision changed; calibration deferred |
| merge-group | Pass with warning: no live evidence was checked for the merge group |
| pr-body-unavailable | Pass with warning: PR body could not be read |
| link-missing | Pass with warning: no optional live report is linked |
| report-missing | Pass with warning: linked summary is absent |
| report-unreadable | Pass with warning: linked summary could not be read |
| report-invalid | Pass with warning: linked summary does not match the schema |
| report-stub | Pass with warning: linked summary is not live-dispatcher evidence |
| report-stale | Pass with warning: summary text digest differs from the head |
| report-incomplete | Pass with warning: summary lacks calls, rows, current thresholds, a clean tree or labelled rows per production judge |
| linked | Pass: live summary measures this revision; warn if thresholds fail |

Checks run in table order. Head-lock validation applies even to bootstrap and
no-base runs. The initial lock introduction passes as bootstrap. Merge-group
runs also warn when a changed scoring surface has no checked live evidence.
Passing this check establishes lock integrity; it does not establish judge quality.
Optional evidence does not authorize skipping Static Checks, Tests Gate, other
required checks, or repository protections.

## Compile settings and limitations

`scripts/content-eval/tsconfig.json` sets `useDefineForClassFields: false`,
matching `apps/server/tsconfig.typecheck.base.json` and the API runtime default.
This removes TS2612 diagnostics from imported API DTOs without editing or
excluding them; content-eval typechecking remains `noEmit`.

DB template edits are not detected by the Git surface gate. Re-run calibration
after editing `system.evaluation`, `prompt.evaluation.post` or
`prompt.evaluation.article`. The evaluations adapter uses schema-enforced
decoding rather than production free-text decoding; its schema omits
`persuasion`. It uses anonymised context and global templates rather than
brand-thread history or prior evaluations. Vision calibration is deferred.
Content-eval tests are not in CI; that remains #4928.

Known gaps from the #5991 post-merge review, tracked separately from this policy:
the lock omits the evaluations
prompt-builder path and the content-quality schema shape, and the
content-quality arm repeats the service's temperature and token literals
instead of sharing them. The lock no longer hashes `evaluations.service.ts`
(billing, persistence and caching only; the bridge drives
`EvaluationsOperationsService` directly), so edits there leave the digest
unchanged.
