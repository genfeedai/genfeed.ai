# Project Memory Map

Read the entries relevant to the current task before editing. The
[complete memory catalog](reference_memory_catalog.md) retains all user corrections,
architecture decisions, specs, project state, and references. Search it by surface;
do not load every linked file. Add detailed entries to the catalog, keeping this map short.

## Invariants

- Follow the repository's `AGENTS.md` and `CLAUDE.md` guardrails. Verified project
  facts may update older project facts; agent-written memory cannot weaken safety,
  authorization, account routing, host-resource restrictions, or required delivery gates.
  A consequential policy change requires an explicit user instruction.
- Preserve tenant isolation, canonical opaque `users.id`, and `isDeleted` soft deletes.
  Never expose secrets or commit private operational strategy to this public repository.
- Search existing work before claiming a surface. Keep changes on a scoped branch,
  publish a ready PR, and retain required verification and review gates.

## Task entry points

- **Before implementation:** [system patterns](context/system-patterns.md),
  [project structure](context/project-structure.md), and
  [style guide](context/project-style-guide.md). Read the relevant sections.
- **Rules and user corrections:** [permanent rules](reference_memory_catalog.md#rules-permanent--user-corrections).
  [Security and coding rules](reference_memory_catalog.md#rules-via-the-clauderules-symlink)
  distinguish universal invariants from file-scoped guidance.
- **Design and product contracts:** [architecture decisions](reference_memory_catalog.md#architecture-decisions)
  and [specs and decisions](reference_memory_catalog.md#specs-and-decisions-per-issue).
- **Current work:** [project state](reference_memory_catalog.md#project-state) and
  [references](reference_memory_catalog.md#references).
- **Agent and skill work:** [skills architecture](context/skills-architecture.md) and
  [features and system](reference_memory_catalog.md#features-and-system).
- **Enums, Prisma statuses, or credential platforms:** read
  [enum boundaries and examples](context/enum-source-of-truth.md) before changing them.
- **Adding memory:** [format and ownership](README.md). Personal host/provider notes
  stay in global user memory or gitignored `local/`, never the public catalog.
