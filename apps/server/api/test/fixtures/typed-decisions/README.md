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

Baseline to beat: the keyword table scores **59/139 (42.4%)** on this set
(41.7% before the #4869 ordering fix), measured on the text the keyword table
actually sees — description plus tags, not `modelName`.
