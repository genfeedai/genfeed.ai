# Session Retention Policy

> Defines how session logs are managed, compacted, and archived.

## Retention Windows

| Type | Location | Keep For | Then |
|------|----------|----------|------|
| Daily logs | `YYYY-MM-DD.md` | 14 days | Roll into weekly summary |
| Weekly rollups | `YYYY-WNN.md` | 8 weeks | Roll into monthly summary |
| Monthly rollups | `YYYYMM.md` | 6 months | Archive to `archive/` |
| Archives | `archive/YYYYMM.md` | Indefinitely | Compressed summaries only |

## What to Preserve in Rollups

### Always Keep
- Architectural decisions and rationale
- Files created or significantly modified
- Patterns discovered or established
- Unfinished work and next steps
- Bugs found and their root causes
- Key configuration changes

### Always Discard
- Step-by-step debugging traces
- Full file contents / large code blocks
- Repetitive task descriptions
- Tool output dumps
- Failed approaches (unless the lesson is valuable)

## Rollup Format

### Weekly Rollup (~200 lines max)
```md
# Week YYYY-WNN (Mon DD - Sun DD)

## Key Decisions
- [Decision]: [Rationale]

## Files Changed
- `path/to/file` — [what changed and why]

## Patterns Discovered
- [Pattern]: [where it applies]

## Unfinished Work
- [ ] [Task]: [current state, next step]

## Lessons Learned
- [Lesson]: [context]
```

### Monthly Rollup (~500 lines max)
```md
# YYYY-MM Session Archive

## Summary
[2-3 sentence overview of the month's work]

## Major Changes
- [Feature/fix]: [files affected, outcome]

## Architecture Decisions
- [Decision]: [rationale, alternatives considered]

## Patterns & Standards
- [Pattern]: [where to apply]

## Carried Forward
- [ ] [Unresolved items]
```

## Automation

Run `/session-rollup` weekly (Fridays) to:
1. Read all daily files from the past week
2. Extract key information per the "Always Keep" list
3. Write a weekly rollup file
4. Move processed daily files to `archive/daily/`
