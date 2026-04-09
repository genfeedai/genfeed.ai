# Genfeed.ai Agent Documentation Hub

Project-level `.agents/` for architecture, rules, context, and operational docs.

## Last Verified

- **Date:** 2026-04-07
- **Verified against:** local codebase + GitHub issues

## Read First

1. `SYSTEM/critical/PRIORITY-READING.md`
2. `SYSTEM/critical/CRITICAL-NEVER-DO.md`
3. `SYSTEM/OPEN-SOURCE-CONTEXT.md`

## Core Navigation

- `context/` — project context files (product, structure, patterns, tech, vision)
- `rules/` — coding rules (security, backend, frontend, packages)
- `skills/` — canonical repo-local skill bundles shared across agents
- `agents/` — specialist agent definitions (7 agents)
- `SYSTEM/` — architecture, critical rules, ADRs, agent runtime
- `SYSTEM/critical/` — production-breaking violation rules
- `SYSTEM/architecture/` — architectural decision records
- `features/` — feature-specific architecture docs
- `QA/` — QA workflow and report templates
- `SESSIONS/` — daily session logs
- `TASKS/README.md` — task policy

## Task Policy

GitHub Issues/Projects are the canonical task system.

- Do not treat local markdown files as canonical backlog.
- `TASKS/` exists for policy compatibility only.

## Historical Content Policy

`SESSIONS/` contains historical session records.

- Do not rewrite historical narratives to match current structure.
- Add forward-looking notes in canonical docs instead of retro-editing logs.

## Tool Integration

This directory is the canonical documentation home for all AI tools:
- **Claude Code**: `CLAUDE.md` uses `@imports` to pull from `context/`. `.claude/rules/` symlinks to `rules/`.
- **Codex**: `CODEX.md` and `AGENTS.md` reference docs here. `.agents/skills/` is canonical and `.codex/skills/` is a symlink alias for runtime discovery.
- **Other tools**: Read `AGENTS.md` at repo root for the universal entry point.
