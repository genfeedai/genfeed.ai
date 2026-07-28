---
name: platform enum usage
description: Use Platform/CredentialPlatform for platform ids; formatPlatformLabel for display
type: project
---

# Platform identity is the Platform enum

**Why:** Bare string compares (`platform === 'youtube'`) drift, miss aliases (`x` for Twitter), and duplicate display-label logic.

**Canonical types**
- Storage/API id: `Platform` / `CredentialPlatform` (same values; `CredentialPlatform` is a re-export of `Platform`)
- Display label: `formatPlatformLabel()` from `@genfeedai/enums`
- Parse free text / aliases: `parsePlatform()` (`x` → twitter, `meta` → facebook)
- Predicates: `isTwitterPlatform`, `isYouTubePlatform`, …

**Do not**
- Add a separate `X` / `meta` enum member for product platforms
- Hand-roll `=== 'twitter' || === 'x'` label branches

**Helpers:** `packages/enums/src/platform.util.ts` (exported from package index)
