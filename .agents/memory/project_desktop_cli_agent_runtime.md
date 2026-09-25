---
name: desktop_cli_agent_runtime
description: Desktop can run agent turns on the user's own Claude Code / Codex CLI; architecture is CLI + Genfeed MCP + Desktop, threads stay in Genfeed, no credits
type: project
status: active
last_verified: 2026-09-25
topics: [desktop, agent, mcp, cli, runtime, billing]
---

**Rule:** The external agent runtime is **CLI + Genfeed MCP + Desktop**. Electron
main (`apps/desktop/app/src/main/cli-agent-runtime.service.ts`) spawns
`claude -p` or `codex exec` with only the Genfeed MCP server configured and
only `mcp__genfeed` tools allowed (Claude: built-in tools removed via
`--tools ""`; Codex: `--sandbox read-only`). The CLI reads brand context through
the `get_brand_context` MCP tool, acts only through Genfeed MCP tools, and the
finished turn is appended with `POST /v1/agent/threads/:threadId/external-turns`.
The API never reserves credits for it and stores the CLI session id in
`AgentThread.config.externalRuntime` for resume. Runtime keys:
`local/claude-cli`, `local/codex-cli`; thread source `desktop-cli`.

It runs in **cloud mode** (Genfeed Cloud or a self-hosted server picked in the
in-app server switcher). It needs no local workspace, PGlite, or local backend,
and it is separate from local/BYOK generation
([project_desktop_byok_generation](project_desktop_byok_generation.md)).

**Why:** Users with Claude Code / Codex subscriptions can use them for the
model turn while threads, brand context, and memory stay in Genfeed. MCP is the
one tool surface, so the CLI gets the same tenant-scoped, permission-checked
actions as any external agent — no second tool API.

**How to apply:**
- Keep the canonical write-up in `apps/desktop/README.md` ("Agent on your
  Claude Code or Codex subscription", "Server selection", "Terminal"); user
  docs (`apps/docs/content/deployment/index.mdx`) summarize and link to it.
- Never bypass CLI permissions or grant built-in file/shell tools to the
  agent turn. The `gf_` key reaches Claude through a `0600` MCP config deleted
  after the turn, and Codex only through the child environment.
- Genfeed tools called by the CLI (generation, publishing) still bill credits;
  only the model turn is free.
- Grok CLI is detected but not offered (no stable headless JSON stream).
- The desktop terminal (`node-pty`) also works in cloud mode; the first session
  per launch asks for native confirmation.
