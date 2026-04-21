# Genfeed.ai Agent Documentation Hub

Project-level `.agents/` for all AI agent knowledge, skills, and operational docs.

## Last Verified

- **Date:** 2026-04-21
- **Verified against:** local codebase + GitHub issues

## Read First

1. `memory/system/PRIORITY-READING.md`
2. `memory/system/CRITICAL-NEVER-DO.md`
3. `memory/system/OPEN-SOURCE-CONTEXT.md`

## Directory Structure

```
.agents/
├── agents/      # 7 specialist agent definitions
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
├── SESSIONS/    # Daily session logs (gitignored)
├── skills/      # Dev/build skills (25 skills)
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
