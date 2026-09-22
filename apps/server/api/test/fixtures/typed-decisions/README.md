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
