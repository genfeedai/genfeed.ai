---
name: serializer-boundary
description: Guardrails for serializer boundaries and response mapping in APIs.
---

# serializer-boundary

Use when API response shapes or model-to-response mappings change.

## When to use

- New/updated API endpoints
- Response contract updates
- Refactors touching Mongoose documents returned to clients

## Hard rules

- Keep serializers in `packages/serializers`.
- Do not return raw Mongoose documents directly to clients.
- Preserve path-alias imports; avoid deep relative import chains.

## Execution checklist

1. Ensure serialization logic lives in `packages/serializers`.
2. Confirm controllers/services emit serialized DTO-style outputs.
3. Confirm imports use established aliases.
4. Run lint and type-check before push.

## Quick verification

- Check serializer usage/placement:
  - `rg -n "serialize|serializer|toJSON|lean\(" apps/server packages/serializers`
- Validate quality gates:
  - `bunx turbo lint && bun type-check`
