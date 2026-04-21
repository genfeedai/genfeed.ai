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

### NEVER Skip Organization Multi-Tenancy (Enterprise Only)

Multi-tenant data isolation is an enterprise feature (`ee/`). When working in `ee/packages/` or enterprise modules, every MongoDB query MUST include `{ organization: orgId, isDeleted: false }`. Security -- data MUST be isolated by organization.

For single-tenant self-hosted deployments, the default organization is used implicitly but the query pattern remains the same for forward compatibility.

```typescript
// CORRECT
return this.model.findOne({
  _id: id,
  organization: organizationId,
  isDeleted: false,
});
```

### NEVER Create Serializers in API App

Serializers MUST live in `packages/serializers/`, NOT in API modules.

### NEVER Use `deletedAt` for Soft Deletes

Use `isDeleted: boolean`. `updatedAt` becomes the deletion timestamp.

### NEVER Create Inline Interfaces

All interfaces go in `packages/props/` (component props) or `packages/interfaces/` (state/helpers). NEVER declare interfaces inline in component files.

### NEVER Add Compound Indexes in Schema

Simple indexes via `@Prop` decorator. Compound indexes in module `useFactory`:

```typescript
@Module({
  imports: [
    MongooseModule.forFeatureAsync([{
      name: Feature.name,
      useFactory: () => {
        const schema = FeatureSchema;
        schema.index({ user: 1, isDeleted: 1 });
        return schema;
      },
    }]),
  ],
})
```

### NEVER Forget isDeleted Filter

Without `isDeleted: false`, soft-deleted items appear in results.

### NEVER Skip AbortController in Frontend useEffect

Every `useEffect` with async calls must use `AbortController` and clean up on unmount. See repo `CLAUDE.md` or `.agents/memory/system/CROSS-PROJECT-RULES.md` for the full pattern.

### NEVER Return Raw Mongoose Documents

Always serialize: DB Document -> Serializer -> Client Response.

### NEVER Use Dynamic Imports in Type Definitions

All imports at top of file, never `import('...')` inline in type definitions.

### NEVER Implement Backward Compatibility Workarounds

Break things properly, then fix them at the source. No aliases, wrappers, or re-exports.

### NEVER Run Full Test Suites Locally

Scoped tests only: `bun test path/to/file.spec.ts` or `bun test src/collections/module/`. Full suite -> CI/CD.
