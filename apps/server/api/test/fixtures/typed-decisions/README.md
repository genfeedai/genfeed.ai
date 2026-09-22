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
