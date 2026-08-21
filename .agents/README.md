# Genfeed.ai Agent Documentation Hub

Project-level `.agents/` for all AI agent knowledge, skills, and operational docs.

## Last Verified

- **Date:** 2026-08-20
- **Verified against:** repository structure and current agent integrations

## Read First

1. `memory/system/PRIORITY-READING.md`
2. `memory/system/CRITICAL-NEVER-DO.md`
3. `memory/system/OPEN-SOURCE-CONTEXT.md`

## Directory Structure

```
.agents/
├── memory/      # All project knowledge
│   ├── MEMORY.md           # Index — start here
│   ├── feedback_*.md       # User corrections (permanent)
│   ├── project_*.md        # Project state
│   ├── reference_*.md      # References
│   ├── context/            # Project context (structure, patterns, style)
│   ├── features/           # Feature architecture docs
│   ├── architecture/       # ADRs
│   ├── rules/              # Coding rules (symlinked to .claude/rules/)
│   └── system/             # Critical rules, agent runtime
├── sessions/    # Daily session logs (gitignored)
├── skills/      # Repo-local development and verification skills
└── README.md    # This file
```

## Tool Integration

| Tool | Memory | Skills | Rules |
|------|--------|--------|-------|
| Claude Code | `CLAUDE.md` @imports from `memory/` | `.claude/skills/` → `.agents/skills/` | `.claude/rules/` → `.agents/memory/rules/` |
| Codex | `.codex/memory/` → `.agents/memory/` | `.codex/skills/` → `.agents/skills/` | — |
| Other | `AGENTS.md` at repo root | — | — |

## Task Policy

GitHub Issues/Projects are the canonical task system. No local task markdown files.
