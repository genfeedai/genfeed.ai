---
name: platform enum usage
description: Use Platform for product ids; map credentials via toPrismaCredentialPlatform/fromPrismaCredentialPlatform
type: project
last_verified: 2026-08-07
---

# Platform identity is the Platform enum

**Why:** Bare string compares (`platform === 'youtube'`) drift, miss aliases (`x` for Twitter), and duplicate display-label logic. Writing domain lowercase into `credentials.platform` silently returns null rows because Prisma stores SCREAMING.

**Canonical types**
- Product / posts / UI id: `Platform` (lowercase values, e.g. `instagram`, `devto`)
- Domain re-export: `CredentialPlatform` === `Platform` (still lowercase — **not** the Prisma enum)
- Prisma column `credentials.platform`: SCREAMING labels (`INSTAGRAM`, `DEVTO`)
- Display label: `formatPlatformLabel()` from `@genfeedai/contracts`
- Parse free text / aliases: `parsePlatform()` (`x` → twitter, `meta` → facebook)
- **Credential boundary:** `toPrismaCredentialPlatform()` / `fromPrismaCredentialPlatform()`
- Predicates: `isTwitterPlatform`, `isYouTubePlatform`, …

**Do**
- Map before every credential `findFirst` / `create` / `update` that filters or writes `platform`
- Map credential rows back to domain before writing `posts.platform` (String lowercase)

**Do not**
- Add a separate `X` / `meta` enum member for product platforms
- Hand-roll `=== 'twitter' || === 'x'` label branches
- Write `platform: 'instagram'` into Prisma credential queries
- Use `as never` to force platform enum writes
- Re-harmonize `posts.platform` (String) into SCREAMING to match credentials

**Helpers:** `packages/contracts/src/enums/platform.util.ts`, `packages/contracts/src/enums/platform-prisma.mapper.ts` (exported from package index)
