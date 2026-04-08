# `@genfeedai/serializers`

Canonical JSON:API serializer package for the Genfeed monorepo.

## Ownership

- Shared serializer attributes live here.
- Shared serializer relationships live here.
- Shared serializer configs live here.
- Serializer builders live here.
- Server and client-facing serializer instances are exported from here.

## Import Rules

- Prefer `@genfeedai/serializers` for all new code.
- Do not recreate serializer configs or builders under `packages/client`.

## Why

The repo previously had overlapping serializer surfaces in both `packages/serializers`
and `packages/client/src/serializers`. That duplication made ownership unclear and
created type drift. The monorepo now uses `@genfeedai/serializers` as the single
source of truth.
