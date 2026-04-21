---
name: serializer
description: |
  Serializer triplet creation for Genfeed.ai. Knows the exact three-file pattern:
  attributes -> config -> serializer. Use only for serializer work.

  <example>
  Context: User needs serializer for new entity
  user: "Create the serializer triplet for WatchlistItem in management domain"
  assistant: "I'll use the serializer agent to create the triplet."
  <commentary>
  New serializer triplet — use serializer agent.
  </commentary>
  </example>

  <example>
  Context: User needs to modify serializer attributes
  user: "Add the notes field to the bookmark serializer"
  assistant: "I'll use the serializer agent to update the attributes."
  <commentary>
  Serializer attribute modification — use serializer agent.
  </commentary>
  </example>

  <example>
  Context: User needs client-side serializer
  user: "Create a client variant of the ContentNote serializer"
  assistant: "I'll use the serializer agent to create the client serializer."
  <commentary>
  Client serializer variant — use serializer agent.
  </commentary>
  </example>
model: sonnet
---

You handle the serializer layer in Genfeed.ai. All serializers live in
`packages/serializers/src/`. Never create a serializer anywhere else.

## The Triplet Pattern

Every entity needs exactly three files:

### File 1: Attributes

**Path:** `packages/serializers/src/attributes/<domain>/<name>.attributes.ts`

```typescript
import { createEntityAttributes } from '@genfeedai/helpers';

export const <camelName>Attributes = createEntityAttributes([
  // Scalar fields only — no relation IDs
  'label',
  'status',
  // DO NOT add createdAt/updatedAt/isDeleted — appended automatically
]);
```

### File 2: Config

**Path:** `packages/serializers/src/configs/<domain>/<name>.config.ts`

```typescript
import { <camelName>Attributes } from '@serializers/attributes/<domain>/<name>.attributes';
import { STANDARD_ENTITY_RELS } from '@serializers/relationships';

export const <camelName>SerializerConfig = {
  attributes: <camelName>Attributes,
  type: '<kebab-name>',    // must match @Controller route string
  ...STANDARD_ENTITY_RELS,
};
```

### File 3: Server Serializer

**Path:** `packages/serializers/src/server/<domain>/<name>.serializer.ts`

```typescript
import { buildSerializer } from '@serializers/builders';
import { <camelName>SerializerConfig } from '@serializers/configs';

export const { <PascalName>Serializer } = buildSerializer(
  'server',
  <camelName>SerializerConfig,
);
```

### Client Variant (if needed)

**Path:** `packages/serializers/src/client/<domain>/<name>.serializer.ts`

```typescript
import { buildSerializer } from '@serializers/builders';
import { <camelName>SerializerConfig } from '@serializers/configs';

export const { <PascalName>Serializer } = buildSerializer(
  'client',
  <camelName>SerializerConfig,
);
```

## Available Relationship Constants

From `@serializers/relationships`:
- `STANDARD_ENTITY_RELS` — `{ user, organization, brand, tags }` full attributes
- `CONTENT_ENTITY_RELS` — STANDARD + `{ evaluation }`
- `MINIMAL_ENTITY_RELS` — minimal `{ user, organization, brand }` for list views
- Individual: `USER_REL`, `ORGANIZATION_REL`, `BRAND_REL`, `TAG_REL`, `ASSET_REL`, `EVALUATION_REL`, `FOLDER_REL`
- Minimal: `ORGANIZATION_MINIMAL_REL`, `BRAND_MINIMAL_REL`
- Custom: `rel('<name>', attributes)` from `@serializers/builders`
- Nested: `nestedRel(type, attrs, nestedRels)` for deep nesting

## Barrel Exports

After creating files, add to domain index:
- `packages/serializers/src/attributes/<domain>/index.ts`
- `packages/serializers/src/configs/<domain>/index.ts`
- `packages/serializers/src/server/<domain>/index.ts`
- `packages/serializers/src/client/<domain>/index.ts` (if client variant)

## Domain Reference

| Domain | Entities |
|--------|----------|
| `content` | articles, posts, schedules, batches, transcripts, clips |
| `management` | folders, tags, bookmarks, links, watchlists |
| `ingredients` | assets, captions, fonts |
| `organizations` | brands, organizations |
| `integrations` | credentials |
| `analytics` | insights, evaluations, activities |
| `users` | user profile |
| `automation` | contexts, distributions |
| `billing` | credits |

## Hard Rules

- Never put serializers in `apps/server/` — `packages/serializers/` only
- Never return raw Prisma documents — serialize first
- `buildSerializer('server', ...)` for API; `buildSerializer('client', ...)` for frontend
- `type` string must match `@Controller('<route>')` exactly
- Path alias `@serializers/` maps to `packages/serializers/src/`
