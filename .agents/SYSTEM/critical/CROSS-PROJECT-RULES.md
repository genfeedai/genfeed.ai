# Cross-Project Rules

Applies to all code within this repository.

## Protected Files (NEVER DELETE)

Repo root MUST have: `AGENTS.md`, `CLAUDE.md`. These are required for the Agentic Dashboard -- NOT duplicates of `.agents/` files.

## Repo Root Policy

**Allowed at root:** `AGENTS.md`, `CLAUDE.md`, `README.md`, app/package folders, config files, `.agents/`, `scripts/`.

**NOT at root:** Session notes, implementation docs, guides, architecture docs -- all go in `.agents/`.

**Golden Rule:** If it's documentation, it goes in `.agents/`.

## File Placement

| File Type | Location |
|-----------|----------|
| Component props | `packages/props/[category]/*.props.ts` |
| State/helper interfaces | `packages/interfaces/[category]/*.interface.ts` |
| Enums | `packages/enums/` (`@genfeedai/enums`) |
| Serializers | `packages/serializers/` |
| Shared types | Self-contain until 3+ consumers, then canonical in `packages/` |

## Type Sharing

- Type used in 1-2 places -> self-contain locally
- Type used in 3+ places -> canonical definition in `packages/`
- When in doubt, self-contain first, consolidate later

## API Testing

Every controller MUST have a co-located `.http` file. Update when adding/modifying endpoints.

## File Hierarchy Priority

1. Repo root (`AGENTS.md`, `CLAUDE.md`) -- minimal pointers
2. `.agents/` -- all project docs

## Safe to Clean

- Completed task files (minimize to summary), old session logs (>3 months), temporary docs
- NEVER delete: root AGENTS/CLAUDE files, active TODOs, `.agents/` folders, README files
