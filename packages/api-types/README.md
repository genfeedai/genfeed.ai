# @genfeedai/api-types

Auto-generated TypeScript types from the OpenAPI spec with Zod validation schemas for runtime validation.

## Overview

This package provides:

1. **Type-safe API contracts** - TypeScript types derived from backend DTOs via OpenAPI
2. **Zod schemas** - Runtime validation matching backend class-validator rules
3. **Form integration** - Use with `@hookform/resolvers` for type-safe forms

## Usage

### Service Layer

```typescript
import type { CreatePostRequest, UpdatePostRequest } from '@genfeedai/api-types';

class PostsService extends BaseService<Post, CreatePostRequest, UpdatePostRequest> {
  // post() and patch() now have compile-time type safety
}

// TypeScript enforces required fields
await postsService.post({
  credential: credentialId,
  label: 'My Post',
  description: 'Content',
  status: PostStatus.DRAFT,
  ingredients: [],
}); // Required fields enforced at compile time
```

### Form Validation

```typescript
import { createPostSchema, type CreatePostRequest } from '@genfeedai/api-types';
import { zodResolver } from '@hookform/resolvers/zod';

const form = useForm<CreatePostRequest>({
  resolver: zodResolver(createPostSchema),
});
```

## Generating Types

Types are generated from the running API server's OpenAPI spec:

```bash
cd packages/api-types

# Local development (fails if API not running)
bun run generate:strict

# With fallback to existing types (default, used in CI)
bun run generate

# Specify a different URL
bun run generate:strict --url https://api.staging.genfeed.ai/v1/openapi.json
```

## CI/CD Integration

Type generation runs automatically before build via turbo:

```json
// turbo.json
{
  "@genfeedai/api-types#generate": {
    "env": ["OPENAPI_URL"],
    "outputs": ["src/generated/**"]
  },
  "@genfeedai/api-types#build": {
    "dependsOn": ["generate"]
  }
}
```

### GitHub Actions Example

```yaml
- name: Build packages
  env:
    OPENAPI_URL: https://api.staging.genfeed.ai/v1/openapi.json
  run: bunx turbo build --filter=@genfeedai/api-types
```

### Fallback Behavior

The `generate` script uses `--skip-on-error` by default:
- If API is reachable: generates fresh types
- If API is unreachable but types exist: uses existing types (warning logged)
- If API is unreachable and no types: build may fail

## Adding New Contracts

1. Create a new contract file in `src/contracts/`:

```typescript
// src/contracts/articles.contract.ts
import { z } from 'zod';
import type { components } from '../generated/api';

export type CreateArticleRequest = components['schemas']['CreateArticleDto'];
export type UpdateArticleRequest = components['schemas']['UpdateArticleDto'];

export const createArticleSchema = z.object({
  // Match the DTO fields
}) satisfies z.ZodType<CreateArticleRequest>;
```

2. Export from `src/contracts/index.ts`

3. Update the service to use typed generics:

```typescript
class ArticlesService extends BaseService<
  Article,
  CreateArticleRequest,
  UpdateArticleRequest
> {}
```

## File Structure

```
src/
├── index.ts              # Main exports
├── generated/
│   └── api.d.ts          # Auto-generated from OpenAPI
├── contracts/
│   ├── index.ts          # Contract exports
│   ├── posts.contract.ts
│   └── ingredients.contract.ts
└── helpers/
    └── common-schemas.ts  # Reusable Zod primitives
```
