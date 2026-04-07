# Priority Reading Order

## Last Verified

- **Date:** 2026-04-07

## Quick Start

1. `CLAUDE.md` (repo rules)
2. `.agents/SYSTEM/critical/CRITICAL-NEVER-DO.md`
3. `.agents/SYSTEM/ARCHITECTURE.md`

## Before Implementing Anything

1. Confirm implemented state from code.
2. Confirm delivery state from GitHub issues/projects.
3. Read relevant canonical docs only.

## Task / Backlog Rule

Use GitHub Issues + Projects as canonical backlog. Do not assume local `INBOX.md` is current.

## Feature Work Reading Order

1. `CLAUDE.md`
2. Relevant ADRs (`.agents/SYSTEM/architecture/`)
3. Similar implementations in code
4. Open GitHub issues and project items for the area

## Debug Work Reading Order

1. Failing tests/logs and affected files
2. Critical rules (`CRITICAL-NEVER-DO.md`)
3. Recent sessions (for context only; do not rewrite history)

## Key Principle

Read minimally but verify aggressively: code + GitHub + canonical docs.
