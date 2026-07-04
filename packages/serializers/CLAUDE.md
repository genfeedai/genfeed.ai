# @genfeedai/serializers

Every entity is a three-file triplet. Never return raw Prisma records from an API — flow is DB record → serializer → response. Serializers live ONLY in this package, never in API modules.

## Triplet pattern (copy a sibling in the same domain)

1. `src/attributes/{domain}/{name}.attributes.ts`

   ```ts
   export const tagAttributes = createEntityAttributes(['organization', 'brand', 'label']);
   ```

   `createEntityAttributes()` (from `@genfeedai/helpers`) auto-adds id, timestamps, and `isDeleted` — list only entity-specific fields.

2. `src/configs/{domain}/{name}.config.ts`

   ```ts
   export const tagSerializerConfig = {
     attributes: tagAttributes,
     brand: BRAND_REL,
     organization: ORGANIZATION_REL,
     type: 'tag',
     user: USER_REL,
   };
   ```

   Relationships come from `@serializers/relationships` (`ORGANIZATION_REL`, `BRAND_REL`, `USER_REL`) or spread `STANDARD_ENTITY_RELS` / `CONTENT_ENTITY_RELS`. Simple entities can use `simpleConfig()`.

3. `src/server/{domain}/{name}.serializer.ts`

   ```ts
   export const { TagSerializer } = buildSerializer('server', tagSerializerConfig);
   ```

## Rules

- Export every new file from its domain `index.ts` barrel, at all three layers.
- Object keys sorted — Biome sorted-keys is enforced.
- Reference triplet: `attributes/management/tag.attributes.ts` → `configs/management/tag.config.ts` → `server/management/tag.serializer.ts`.
- Verify: `bun run test --filter=@genfeedai/serializers`.
