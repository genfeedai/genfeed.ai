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

## Drift Coverage

Run `bun run check:serializer-drift` after changing a Prisma-backed document or
serializer. The guard discovers canonical flat triplets, known renamed
triplets, and serializers embedded in relationship configs.

Prisma-backed documents without a standalone public serializer must have an
explicit reason in `INTENTIONALLY_UNSERIALIZED_SCHEMAS`. This includes analytics
storage models consumed by aggregate serializers, such as `ArticleAnalytics`
and `PostAnalytics`. The guard fails when a schema is unclassified, when
multiple serializers ambiguously target one schema, or when an exception
becomes stale.

## Why

The repo previously had overlapping serializer surfaces in both `packages/serializers`
and `packages/client/src/serializers`. That duplication made ownership unclear and
created type drift. The monorepo now uses `@genfeedai/serializers` as the single
source of truth.
