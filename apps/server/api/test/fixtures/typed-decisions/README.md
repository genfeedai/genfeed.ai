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
