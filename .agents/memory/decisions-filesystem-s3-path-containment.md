---
name: Filesystem and S3 path containment decisions
description: Canonical helper placement, S3 semantics, and adapter-boundary decisions for issue #2068
type: project
---

# Filesystem and S3 Path Containment Decisions

## Decision: canonicalize the pure helper in `@genfeedai/storage`

Move the framework-agnostic containment primitives into
`packages/storage/src/path-containment.ts` and re-export them through
`@libs/security`.

**Why:** `packages/libs` already depends on `@genfeedai/storage`, so this removes
the `LocalStorageProvider` copy without a dependency cycle or a new workspace.
Existing `@libs/security` imports remain stable.

**How to apply:** Keep the helper limited to `node:path` and injected error
factories. Never import NestJS into `packages/storage`.

## Decision: validate S3 keys with POSIX segment semantics

Construct keys beneath a fixed prefix and reject absolute, backslash, NUL,
empty, `.` and `..` segments instead of normalizing them.

**Why:** S3 keys are literal identifiers. Normalizing a valid key can silently
address a different object, while bare `startsWith(prefix)` permits prefix
confusion such as `ingredients-evil`.

**How to apply:** Preserve legitimate nested candidates byte-for-byte and join
them to a normalized fixed prefix with exactly one `/`.

## Decision: contain at trust boundaries, not by inventing one adapter root

Files jobs/controllers contain local paths under `public/tmp`; image and voice
services use their configured dataset/model roots. Generic storage adapters do
not acquire a fake global root.

**Why:** Shared adapters legitimately serve multiple roots. A fabricated root
would break valid dataset and model flows without adding security if callers
can still pass arbitrary paths.

**How to apply:** Validate before the generic adapter call. If CodeQL retains an
adapter-level dataflow alert after all upstream boundaries are guarded, document
the complete guarded call chain before dismissing it.

## Decision: preserve exception and cleanup behavior

Nest boundaries inject `BadRequestException`; framework-agnostic providers
inject `Error`. Best-effort cleanup validates each path independently, logs an
invalid or failed deletion, and continues with sibling paths.

**Why:** This matches #2064 and prevents one malicious or stale cleanup entry
from aborting unrelated cleanup work.

**How to apply:** Run containment before existence checks. Update fixtures that
previously staged paths outside their owning root.
