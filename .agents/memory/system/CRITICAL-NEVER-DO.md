# CRITICAL: NEVER DO THIS

Violations that break builds, lose data, or violate architecture. For positive coding standards, see the repo's CLAUDE.md.

## Project-Specific Highlights

Read BOTH this file and the project's own critical doc before coding.

- Frontend (`apps/app`): NEVER run unscoped full builds at repo root. Use scoped Bun/Turbo app builds (for example `bunx turbo build --filter=@genfeedai/app`). See: `.agents/memory/system/CRITICAL-NEVER-DO.md`
- Backend (`apps/server`): Scoped tests allowed (single file/module). NEVER unscoped `bun test`. Enforce `isDeleted: false`. See: `.agents/memory/system/CRITICAL-NEVER-DO.md`

---

## File Management

### NEVER Work Outside Workspace Directory

All operations within the workspace root only. NEVER use `/tmp`, `/private/tmp`, or any external directory.

### NEVER DELETE Protected Root Files

At repo root: `AGENTS.md`, `CLAUDE.md`, `README.md`. These are required for the Agentic Dashboard -- NOT duplicates of `.agents/` files.

### NEVER Create Root-Level .md Files

Only 3 allowed at root: `AGENTS.md`, `CLAUDE.md`, `README.md`. Everything else goes in `.agents/`.

### Session Files: ONE FILE PER DAY

Pattern: `.agents/SESSIONS/YYYY-MM-DD.md`. Multiple sessions same day -> add to SAME file. Only allowed patterns: `README.md`, `TEMPLATE.md`, `YYYY-MM-DD.md`.

---

## Coding Violations

### Keep Organization Multi-Tenancy Guards (Enterprise Only)

Multi-tenant data isolation is an enterprise feature (`ee/`). When working in `ee/packages/` or enterprise modules, every organization-scoped data access must include organization scope and `isDeleted: false`. Security -- data MUST be isolated by organization.

For single-tenant self-hosted deployments, the default organization is used implicitly but the query pattern remains the same for forward compatibility.

```typescript
// CORRECT
return prisma.resource.findFirst({
  where: {
    id,
    organizationId,
    isDeleted: false,
  },
});
```

### NEVER Create Serializers in API App

Serializers MUST live in `packages/serializers/`, NOT in API modules.

### NEVER Use `deletedAt` for Soft Deletes

Use `isDeleted: boolean`. `updatedAt` becomes the deletion timestamp.

### NEVER Create Inline Interfaces

All interfaces go in `packages/props/` (component props) or `packages/interfaces/` (state/helpers). NEVER declare interfaces inline in component files.

### Keep Compound Indexes In Prisma Schema Or Migrations

Use Prisma schema indexes or explicit migrations for compound database indexes. Keep index definitions close to the model or migration that owns them.

### NEVER Forget isDeleted Filter

Without `isDeleted: false`, soft-deleted items appear in results.

### NEVER Skip AbortController in Frontend useEffect

Every `useEffect` with async calls must use `AbortController` and clean up on unmount. See repo `CLAUDE.md` or `.agents/memory/system/CROSS-PROJECT-RULES.md` for the full pattern.

### Serialize API Responses

Always serialize: DB record -> Serializer -> Client Response.

### NEVER Use Dynamic Imports in Type Definitions

All imports at top of file, never `import('...')` inline in type definitions.

### NEVER Implement Backward Compatibility Workarounds

Break things properly, then fix them at the source. No aliases, wrappers, or re-exports.

### NEVER Run Full Test Suites Locally

Scoped tests only: `bun test path/to/file.spec.ts` or `bun test src/collections/module/`. Full suite -> CI/CD.
