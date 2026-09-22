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
