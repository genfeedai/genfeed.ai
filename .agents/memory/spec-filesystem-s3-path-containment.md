---
name: Filesystem and S3 path containment
description: Shared fixed-root and fixed-prefix containment contract for issue #2068
type: project
---

# Filesystem and S3 Path Containment

## Purpose

Eliminate user-influenced filesystem traversal and S3 key traversal across the
files, images, voices, shared S3, and storage layers. Every trust boundary
resolves a candidate under a fixed filesystem root or constructs a key under a
fixed S3 prefix before any read, write, delete, existence check, or SDK call.

**Why:** `path.join` and `path.resolve` normalize `..` segments rather than
rejecting them. S3 keys have analogous prefix-confusion and traversal hazards
when callers or downstream tooling normalize keys.

**How to apply:** Use the canonical framework-agnostic helpers exported by
`@genfeedai/storage`. NestJS consumers inject `BadRequestException`; storage
providers inject plain `Error` and remain framework-independent.

## Interfaces

- `resolveContainedPath(rootDir, candidatePath, createError)` returns an
  absolute path that is equal to or below the resolved root.
- `resolveContainedObjectKey(prefix, candidateKey, createError)` returns a
  relative POSIX S3 key below the normalized prefix.
- `assertObjectKeyWithinPrefix(prefix, key, createError)` validates an existing
  key without rewriting it.
- `assertSafeSegment(value, name, createError)` validates one path/key segment.

S3 key helpers reject empty input, absolute candidates, backslashes, NUL,
empty/`.`/`..` segments, and prefix confusion. Legitimate nested keys remain
unchanged.

## Fixed boundaries

- Image datasets: `DATASETS_PATH`.
- Voice datasets: `DATASETS_PATH/voices`.
- Files service temporary artifacts: `process.cwd()/public/tmp`.
- LoRA and voice model uploads: their configured model roots.
- Generated S3 keys: the owning `ingredients/...` or feature prefix.

Generic storage adapters may accept caller-selected paths internally, but every
request/job boundary feeding them must first establish a fixed root.

## Non-goals

- Restricting internal storage adapters to one global local directory.
- Adding NestJS dependencies to `packages/storage`.
- Rewriting valid S3 key bytes through filesystem normalization.
- Changing deployment, bucket, or retention policy.

## Acceptance criteria

- THE SYSTEM SHALL use one canonical containment implementation in every listed
  area and SHALL NOT retain a local duplicate.
- WHEN a candidate escapes its fixed filesystem root, THE SYSTEM SHALL reject
  it before any filesystem probe or mutation.
- WHEN a candidate S3 key escapes or confuses its fixed prefix, THE SYSTEM
  SHALL reject it before any SDK call.
- WHEN a NestJS boundary rejects a path or key, THE SYSTEM SHALL throw
  `BadRequestException`.
- WHEN a framework-agnostic storage provider rejects a path or key, THE SYSTEM
  SHALL throw an injected plain `Error`.
- WHEN a legitimate nested path or key remains under its root or prefix, THE
  SYSTEM SHALL preserve and accept it.
- THE PR SHALL leave no unexplained open `js/path-injection` alert in scope.

## Test plan

Add or extend focused specs for the shared helpers, both storage providers,
shared/files S3 services, files temp-path services, and image/voice dataset
services. Each area covers at least one traversal rejection and one legitimate
nested path/key. Runtime tests, typechecks, builds, and CodeQL run in GitHub CI
because the implementation machine is the MacBook Pro.
