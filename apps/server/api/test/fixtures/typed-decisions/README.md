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
