---
name: next agent rules off
description: Keep Next from rewriting CLAUDE.md and AGENTS.md
type: feedback
---

# Next does not own agent rule files

`agentRules` stays `false` on every Next config. `next dev` must not upsert
the managed `nextjs-agent-rules` block into `CLAUDE.md` or `AGENTS.md`.

**Why:** Next 16.3+ writes that block at the Next project root (`apps/app`,
`apps/website`, `apps/docs`), not the monorepo root. Agent rules already live
in root `CLAUDE.md` / `AGENTS.md` and `.agents/memory/`.

**How to apply:**

- Set `agentRules: false` in `createAppNextConfig` and any Next config that
  does not use that helper.
- Do not commit the generated `<!-- BEGIN:nextjs-agent-rules -->` block.
- If `next dev` rewrites a file anyway, the config opt-out is missing or
  being stripped by a wrapper — fix the config, do not keep the block.
