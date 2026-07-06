# Launch Copy Creator

Generates channel-conform launch copy for the two channels dev-founders launch on:

- **Hacker News (Show HN)** — a convention-correct `Show HN:` title (≤80 chars, no hype) plus an honest maker's first comment.
- **Product Hunt** — 3–5 punchy tagline variants (≤60 chars) plus a maker's first comment.

The rules in [`SKILL.md`](./SKILL.md) are the prompt-engineering source for the backend `launch-copy` generator (`apps/server/api/src/collections/launch-copy/`), which produces this copy via the platform LLM.

**Generation only** — this never posts to any channel and never simulates engagement.
