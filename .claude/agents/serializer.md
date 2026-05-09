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
  Context: User needs a list-view serializer variant
  user: "Create a minimal list serializer for posts"
  assistant: "I'll use the serializer agent to add the list config and serializer."
  <commentary>
  List-view serializer variant — use serializer agent.
  </commentary>
  </example>
model: sonnet
---

You handle the serializer layer in Genfeed.ai. All serializers live in
`packages/serializers/src/`. Never create a serializer anywhere else.

## Directory Structure

```
packages/serializers/src/
  attributes/<domain>/     # Entity attribute arrays
  builders/                # buildSerializer, rel, nestedRel, simpleConfig
  configs/<domain>/        # Serializer configs (attributes + relationships)
  helpers/                 # toPlainJson utility
  interfaces/              # ISerializer, IDeserializer
  relationships/           # Shared relationship constants
  server/<domain>/         # Server-side serializers
```

There is no `client/` directory in the source tree. Client serializers are built
inline by consumers using `buildSerializer('client', config)`.

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

A config file can export **multiple configs** for different use cases:

```typescript
import { <camelName>Attributes } from '@serializers/attributes/<domain>/<name>.attributes';
import { STANDARD_ENTITY_RELS, MINIMAL_ENTITY_RELS } from '@serializers/relationships';

// Full detail view
export const <camelName>SerializerConfig = {
  attributes: <camelName>Attributes,
  type: '<kebab-name>',    // must match @Controller route string
  ...STANDARD_ENTITY_RELS,
};

// Lightweight list view
export const <camelName>ListSerializerConfig = {
  attributes: <camelName>Attributes,
  type: '<kebab-name>',
  ...MINIMAL_ENTITY_RELS,
};
```

For entities with no relationships, use `simpleConfig`:
```typescript
import { simpleConfig } from '@serializers/builders';
export const <camelName>SerializerConfig = simpleConfig('<kebab-name>', <camelName>Attributes);
```

### File 3: Server Serializer

**Path:** `packages/serializers/src/server/<domain>/<name>.serializer.ts`

```typescript
import { buildSerializer } from '@serializers/builders';
import { <camelName>SerializerConfig, <camelName>ListSerializerConfig } from '@serializers/configs';

export const { <PascalName>Serializer } = buildSerializer('server', <camelName>SerializerConfig);
export const { <PascalName>ListSerializer } = buildSerializer('server', <camelName>ListSerializerConfig);
```

## Builder Functions

From `@serializers/builders`:

| Function | Purpose |
|----------|---------|
| `buildSerializer(type, config)` | Main builder. `type` is `'server'` or `'client'`. Returns `{ <Name>Serializer }` |
| `buildSingleSerializer(type, config)` | Returns single `ISerializer` instead of named record |
| `simpleConfig(type, attributes)` | Config shorthand for no-relationship entities |
| `rel(type, attributes)` | Relationship definition shorthand |
| `nestedRel(type, attributes, nestedRels)` | Nested relationship (rel-within-rel) |
| `createSerializerConfig(type, attributes, relationships?)` | Explicit config builder |

## Relationship Constants

From `@serializers/relationships`:

### Preset bundles
| Constant | Contains |
|----------|----------|
| `STANDARD_ENTITY_RELS` | `{ user, organization, brand, tags }` — full attributes |
| `CONTENT_ENTITY_RELS` | STANDARD + `{ evaluation }` |
| `MINIMAL_ENTITY_RELS` | `{ user, organization, brand }` — minimal attributes for list views |

### Individual relationships
`USER_REL`, `ORGANIZATION_REL`, `BRAND_REL`, `TAG_REL`, `ASSET_REL`, `EVALUATION_REL`, `FOLDER_REL`

### Minimal variants
`ORGANIZATION_MINIMAL_REL` — `rel('organization', ['label'])`
`BRAND_MINIMAL_REL` — `rel('brand', ['label', 'slug'])`

### Custom relationships
```typescript
import { rel, nestedRel } from '@serializers/builders';

// Simple custom rel
const ingredientRel = rel('ingredient', ['label', 'type', 'url']);

// Nested rel (rel with its own relationships)
const ingredientWithMetadata = nestedRel('ingredient', ['label', 'type'], {
  metadata: rel('metadata', ['key', 'value']),
});
```

## Helpers

`toPlainJson<T>` from `@serializers/helpers` — converts serialized output to plain JSON object.

## Barrel Exports

After creating files, add to domain index:
- `packages/serializers/src/attributes/<domain>/index.ts`
- `packages/serializers/src/configs/<domain>/index.ts`
- `packages/serializers/src/server/<domain>/index.ts`

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
- Use `MINIMAL_ENTITY_RELS` for list endpoints, `STANDARD_ENTITY_RELS` for detail
