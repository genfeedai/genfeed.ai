# Typed decision fixtures

Labelled sets for `scripts/typed-decisions/benchmark.ts` (#4864). One JSONL
file per decision point; each line is one labelled example:

```json
{ "question": "…", "options": ["a", "b"], "state": { … }, "expected": "a", "source": "where the label came from" }
```

`expected` picks the question kind: a string is a choice, a number a score, a
boolean a decision. `question` and `options` may be set once on the command
line (`--question`, `--options`) instead of per row.

`reply-bot-intent.example.jsonl` is a four-row example that only exists to make
the script runnable. It is not a benchmark: every migration in epic #4863 ships
its own labelled set, sized to say something about accuracy, and reports the
number before its decision point goes live.

## `agent-auto-routing-tier.jsonl`

23 rows for the agent's `agent.auto_routing_tier` decision (#4865). Their
`state` is the exact shape `AgentAutoModelResolverService` sends, so a run
measures the live call site rather than a paraphrase of it. The labels are
hand-assigned against the tier rubric in `AgentChatRoutingTier`, not drawn from
production traffic, and **no accuracy number has been reported for it yet** —
`AGENT_AUTO_ROUTING_DECISION_MODE` stays `off` until a benchmark run and a week
of shadow telemetry say otherwise.

`task-routing-output-type.jsonl` is the labelled set for `task_routing.output_type`
(#4867): 251 rows over the seven `TASK_OUTPUT_TYPES`, each state shaped exactly
like the one `TaskRoutingService` sends (request text, platforms, attachment
count, brand flag). The requests are **synthetic** — written by hand to cover
the phrasings the keyword table handles and the ones it misses (plurals like
"clips"/"shorts", `post` inside an image request, `issue`/`email` inside a
video request, and `facecam`, which no pattern can produce) — not sampled from
production. Today's regex table scores **51.8% (130/251)** on it. That number
is a baseline for the fixture, not a production accuracy claim, and the flip to
`live` still waits on a genuinely labelled set.
## `content-pattern-labels.jsonl`

220 posts for the pattern analyzer's two label decisions (#4868), two rows per
post: one for `content_pattern.pattern_type`, one for
`content_pattern.template_category`. Both carry their own `question` and
`options`, and `state` is exactly what the service sends — `{ platform,
postText }`.

The rows are **synthetic**, constructed to cover every label rather than
sampled from production, so a number measured on them says the shape of the
call works, not how accurate the decision is on real creator posts. The flip to
`live` waits on a genuinely labelled set.

The benchmark reports one accuracy per run, so split the file by decision point
first:

```bash
grep '"Which reusable pattern' content-pattern-labels.jsonl > /tmp/pattern-type.jsonl
grep '"Which template category' content-pattern-labels.jsonl > /tmp/template-category.jsonl
```

## `reply-bot-intent.jsonl` (#4866)

The labelled set for the `reply_bot.intent` decision point: 359 comments across
the five `ReplyIntent` values, in the exact state shape
`ReplyIntentClassifierService` sends (`authorHandle`, `comment`, `hasLinks`,
`postCaption`).

**It is constructed, not sampled.** Nobody outside the deployment can reach
production comments, so these rows were written to be representative — ordinary
cases, plus the boundaries a four-regex classifier gets wrong (hostility with no
slur in it, spam that opens with a compliment, a question with no question
mark). Treat any accuracy it produces as a statement about this fixture, never
as a live accuracy number. Flipping the decision point to `live` still needs the
spam false-positive rate measured against a genuine labelled set.

`reply-bot-intent-fixture.spec.ts` guards its shape and pins what the incumbent
regex scores on it: 65% accuracy overall, and a 0.3% spam false-positive rate —
the bar a replacement has to clear.

```bash
bun run bench:typed-decisions -- \
  --fixture=apps/server/api/test/fixtures/typed-decisions/reply-bot-intent.jsonl
```
## Sets

`untrusted-content-injection.jsonl` — 217 rows for the untrusted-content
injection gate (#4870, `agent.untrusted_content_injection`). 135 benign tool
results (search snippets, connector threads, long articles, upload
transcripts, structured payloads with no prose, and hard negatives that
legitimately quote or discuss instructions) against 82 direct, paraphrased,
role-play, social-engineering, obfuscated and buried-in-an-article injection
attempts. `state` matches what the gate sends — `{ content, source, toolName }`
— and `content` is the raw serialization the model would read, because that is
what the gate classifies. Scrubbing the fixture would measure text production
never sees: a payload of literal injection phrases arrives as `[REMOVED]`
markers and reads clean, while the model still gets the original.

Every row is **synthetic**: written for this issue, not sampled from
production traffic. The rates it reports are therefore a floor on the work,
not a measurement of the real world. The false-positive rate on real tool
traffic is sized from `shadow` mode telemetry, and that is what gates the flip
to `live`.

## model-discovery-category.jsonl (#4869)

139 labelled rows, generated — never hand-edited — by

```
bun run build:typed-decision-fixture:model-discovery
```

from `UNIFIED_MODEL_CATALOG`, the registry seed. Each curated seed row already
pairs a provider endpoint, a description and schema-derived capability metadata
with a human-approved category, and the generator projects those into the exact
`state` shape `ModelDiscoveryService.buildCategoryState` sends.

Read the numbers with the construction in mind:

- Rows whose seed description is the placeholder `"<Label> (<category>)"` ship
  with an **empty** description and are marked `(name-only)` in `source`; the
  placeholder string is the label. 103 of the 139 rows are name-only, which is
  also the common case in real discovery listings.
- `outputSchema` is empty on every row. An unambiguous output schema never
  reaches the decision provider — layer 1 of `classifyCategory` short-circuits
  it — so carrying one would measure a path that does not exist.
- The set is skewed the way the catalogue is: 54 `image` and 46 `video` rows
  against 1 `embedding` and 2 each of `image-edit`, `image-upscale`,
  `video-edit`. A per-class number matters more here than the headline.
- The set is also **wider than the population the decision point meets**. Only
  the Replicate and fal watchers discover models, so the 90 `replicate` and 24
  `fal` rows — 114 of 139 — are the discovery-reachable subset; the 13
  `openrouter`, 11 `genfeed-ai` and 1 `mureka` rows are hand-seeded and the
  classifier is never asked about them in production. The generator prints
  both totals, and rollout reads the reachable one:

  ```bash
  bun run bench:typed-decisions -- \
    --fixture=apps/server/api/test/fixtures/typed-decisions/model-discovery-category.jsonl \
    --state-filter=provider=replicate,fal \
    --min-accuracy=0.43
  ```

  `--state-filter` prints the selection it made (`rows: 114 of 139 selected`),
  so the number a gate is read off is never implicit. Drop the filter for the
  catalogue-wide coverage run.

Baselines the provider has to beat, measured on the text the keyword table
actually sees — description plus tags, not `modelName`:

| Population | Rows | Keyword table | Benchmark invocation |
|---|---|---|---|
| **Discovery-reachable (`replicate` + `fal`)** — the rollout gate | 114 | **49 (43.0%)** | `--state-filter=provider=replicate,fal` |
| Whole catalogue — benchmark coverage | 139 | 60 (43.2%) | no filter |

The #4869 keyword-ordering fixes account for both: 47 → 49 reachable
(41.2% → 43.0%) and 58 → 60 overall (41.7% → 43.2%).
