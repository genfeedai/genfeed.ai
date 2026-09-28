# Cross-Project Rules

Applies to all code within this repository.

## Protected Files / Repo Root Policy

Full, current list: `system/CRITICAL-NEVER-DO.md` (File Management section). Golden rule: if it's
documentation, it goes in `.agents/`.

## File Placement

| File Type | Location |
|-----------|----------|
| Component props | `packages/props/[category]/*.props.ts` |
| State/helper interfaces | `packages/contracts/src/interfaces/[category]/*.interface.ts` |
| Enums | `packages/contracts/src/enums/` (`@genfeedai/contracts`) |
| Serializers | `packages/serializers/` |
| Shared types | Self-contain until 3+ consumers, then canonical in `packages/` |

## Type Sharing

- Type used in 1-2 places -> self-contain locally
- Type used in 3+ places -> canonical definition in `packages/`
- When in doubt, self-contain first, consolidate later

## File Hierarchy Priority

1. Repo root (`AGENTS.md`, `CLAUDE.md`) -- minimal pointers
2. `.agents/` -- all project docs

## Safe to Clean

- Completed task files (minimize to summary), old session logs (>3 months), temporary docs
- NEVER delete: root AGENTS/CLAUDE files, active TODOs, `.agents/` folders, README files
