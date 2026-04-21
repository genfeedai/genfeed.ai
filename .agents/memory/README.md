# .agents/memory/

Project-level cross-agent memory. Git-tracked. Read by Claude Code, Codex CLI, and Cursor.

## How it's wired

- **Claude Code**: `CLAUDE.md` imports `@.agents/memory/MEMORY.md` at session start. Claude Code's per-project auto-memory directory at `~/.claude-genfeedai/projects/-Users-decod3rs-www-genfeedai-genfeed-ai/memory/` is a **symlink** to this directory, so every auto-memory write lands here automatically and shows up in `git status`.
- **Codex CLI**: `AGENTS.md` at the repo root contains a "Project Memory" section instructing Codex to read `.agents/memory/MEMORY.md` + relevant linked files at session start.
- **Cursor**: `.cursor/rules/project-rules.mdc` is an `alwaysApply: true` rule that inlines `@.agents/memory/MEMORY.md` into every Cursor chat context.

All three agents see the same files. Learnings land here once and propagate automatically.

## File format

Every memory file has YAML frontmatter:

```markdown
---
name: {short name}
description: {one-line description — used to judge relevance}
type: feedback | project | reference
---

{body — for feedback/project, structured as rule + **Why:** + **How to apply:**}
```

`MEMORY.md` is the index. Each entry is one line: `- [Title](file.md) — one-line hook`. Keep the index concise (under 200 lines) so it fits cleanly into context.

## What belongs here

Project-level rules and facts that apply to this repo regardless of which agent is reading them:

- **feedback_\*.md** — user-corrected or user-validated patterns (e.g. `feedback_ui_primitives.md`, `feedback_proxy_middleware.md`)
- **project_\*.md** — facts about current work, goals, deadlines, stakeholders (e.g. `project_one_api_epic.md`, `project_bullmq.md`)
- **reference_\*.md** — pointers to external systems (Linear boards, Grafana dashboards, etc.)

## What does NOT belong here

- Code patterns derivable from the codebase (read the code instead)
- Git history (use `git log` / `git blame`)
- Fix recipes or debug solutions (the fix is in the code; commit messages have the context)
- User-level preferences that apply across all of decod3rs's projects (those live in a separate user-level memory location, not git-tracked here)
- Session-ephemeral state (goes in `.agents/SESSIONS/YYYY-MM-DD.md` instead)
- Secrets, credentials, API keys, tokens (obviously)

## Writing memory

Two steps to add a new memory:

1. Create the file: `.agents/memory/{type}_{name}.md` with frontmatter and body
2. Add a one-line entry to `.agents/memory/MEMORY.md` pointing at it

Because this dir is the symlink target of Claude Code's auto-memory, any auto-memory write will automatically appear in `git status` for commit. Commit new memories in the same PR as the code change they document, or as a standalone `chore(memory): ...` commit.

## Conflict resolution

If a rule in `.agents/memory/` conflicts with a rule in `CLAUDE.md` or `AGENTS.md`, the `.agents/memory/` version wins (it's newer). Stale memory should be updated or deleted rather than left to drift.

## Related

- `rules/` — coding rules (security, backend, frontend, packages) — symlinked to `.claude/rules/`
- `context/` — project structure, patterns, style guide
- `system/` — critical rules, agent runtime, architecture
- `features/` — feature architecture docs
- `architecture/` — ADRs
- `.agents/SESSIONS/` — daily session logs — ephemeral journal, not memory
