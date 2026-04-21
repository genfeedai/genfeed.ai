---
name: new-entity
description: |
  Scaffold a complete new Prisma entity end-to-end across all 13 layers of the Genfeed.ai
  monorepo. Use when adding a brand new data entity that needs the full stack: schema,
  enums, interfaces, client model, domain model, serializer triplet, API endpoint constant,
  NestJS collection, module registration, frontend service, and React hook.
  Triggers on: 'new entity', 'add entity', 'scaffold entity', '/new-entity', 'new collection'.
version: 1.0.0
tags:
  - scaffolding
  - prisma
  - full-stack
  - automation
---

# new-model

Scaffold a new Prisma entity across all 13 layers of the monorepo.

## Arguments

```
/new-model <EntityName> <domain> [field:Type ...]
```

- `EntityName` — PascalCase: `WatchlistItem`, `ContentNote`, `CampaignTarget`
- `domain` — One of: `content`, `management`, `auth`, `organization`, `analytics`, `automation`, `billing`
- `field:Type` — Optional. Types: `String`, `String?`, `Boolean`, `Int`, `DateTime`, `DateTime?`, enum names. Standard fields (userId, organizationId, brandId, isDeleted, createdAt, updatedAt) are always generated.

## Derived Names

| Pattern | Example for `WatchlistItem` |
|---------|----------------------------|
| PascalCase | `WatchlistItem` |
| camelCase | `watchlistItem` |
| kebab-case | `watchlist-item` |
| snake_case | `watchlist_items` (DB table) |
| plural kebab | `watchlist-items` (route, dir) |
| SCREAMING_SNAKE | `WATCHLIST_ITEMS` (constant) |

## Pre-Flight Checks

Before writing any file:
1. Confirm `packages/prisma/prisma/schema.prisma` has no existing `model <EntityName>`
2. Confirm `apps/server/api/src/collections/<plural-kebab>/` does not exist
3. Confirm `packages/enums/src/<kebab>.enum.ts` does not exist (if enums needed)
4. Ask user: brand-scoped or org-only? Full ownership chain (user+org+brand) or subset?

## Layer 1: Prisma Schema

**File:** `packages/prisma/prisma/schema.prisma`

Append model block. Always include `mongoId String? @unique` (migration compat).

```prisma
model <EntityName> {
  id             String       @id @default(cuid())
  mongoId        String?      @unique
  userId         String
  user           User         @relation(fields: [userId], references: [id])
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  brandId        String?
  brand          Brand?       @relation(fields: [brandId], references: [id])

  // custom fields from arguments
  // label         String
  // status        <EntityName>Status @default(DRAFT)

  isDeleted      Boolean      @default(false)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@map("<snake_case_plural>")
}
```

If enums needed, add in ENUMS section at top of schema:
```prisma
enum <EntityName>Status {
  DRAFT
  ACTIVE
  ARCHIVED
}
```

**Important:** Also add the reverse relation field to the User, Organization, and Brand models.

After editing:
```bash
cd packages/prisma && bunx prisma migrate dev --name "add_<snake_case>_model"
```

## Layer 2: TypeScript Enum

**File:** `packages/enums/src/<kebab>.enum.ts` (skip if no enums)

```typescript
export enum <EntityName>Status {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}
```

**Barrel:** Add `export * from './<kebab>.enum';` to `packages/enums/src/index.ts`.

## Layer 3: Interface

**File:** `packages/interfaces/src/<domain>/<name>.interface.ts`

```typescript
import type { <EntityName>Status } from '@genfeedai/enums';
import type { IBaseEntity, IBrand, IOrganization, IUser } from '../index';

export interface I<EntityName> extends IBaseEntity {
  user: IUser;
  organization: IOrganization;
  brand?: IBrand;
  // custom fields
}
```

**Barrel:** Add to `packages/interfaces/src/<domain>/index.ts` and `packages/interfaces/src/index.ts`.

## Layer 4: Client Model

**File:** `packages/client/src/models/<domain>/<name>.model.ts`

```typescript
import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { I<EntityName>, IBrand, IOrganization, IUser } from '@genfeedai/interfaces';

export class <EntityName> extends BaseEntity implements I<EntityName> {
  public declare user: IUser;
  public declare organization: IOrganization;
  public declare brand?: IBrand;
  // public declare <field>: <Type>;

  constructor(data: Partial<I<EntityName>> = {}) {
    super(data);
  }
}
```

**Barrel:** Add to `packages/client/src/models/<domain>/index.ts`.

**Test:** `packages/client/src/models/<domain>/<name>.model.test.ts`
```typescript
import { describe, expect, it } from 'vitest';
import { <EntityName> } from './<name>.model';

describe('<EntityName>', () => {
  it('constructs with partial data', () => {
    const entity = new <EntityName>({ id: 'test-id' });
    expect(entity.id).toBe('test-id');
  });
});
```

## Layer 5: Domain Model

**File:** `packages/models/<domain>/<name>.model.ts`

```typescript
import { <EntityName> as Base<EntityName> } from '@genfeedai/client/models';
import type { I<EntityName> } from '@genfeedai/interfaces';
import { Brand } from '@models/organization/brand.model';
import { User } from '@models/auth/user.model';

export class <EntityName> extends Base<EntityName> {
  constructor(partial: Partial<I<EntityName>>) {
    super(partial);

    if (partial?.brand && typeof partial.brand === 'object') {
      this.brand = new Brand(partial.brand);
    }
    if (partial?.user && typeof partial.user === 'object') {
      this.user = new User(partial.user);
    }
  }
}
```

**Barrel:** Add to `packages/models/<domain>/index.ts`.

**Test:** `packages/models/<domain>/<name>.model.test.ts`

## Layer 6: Serializer Attributes

**File:** `packages/serializers/src/attributes/<domain>/<name>.attributes.ts`

```typescript
import { createEntityAttributes } from '@genfeedai/helpers';

export const <camelName>Attributes = createEntityAttributes([
  'user', 'organization', 'brand',
  // custom scalar fields
  // DO NOT add createdAt/updatedAt/isDeleted
]);
```

**Barrel:** Add to `packages/serializers/src/attributes/<domain>/index.ts`.

## Layer 7: Serializer Config

**File:** `packages/serializers/src/configs/<domain>/<name>.config.ts`

```typescript
import { <camelName>Attributes } from '@serializers/attributes/<domain>/<name>.attributes';
import { STANDARD_ENTITY_RELS } from '@serializers/relationships';

export const <camelName>SerializerConfig = {
  attributes: <camelName>Attributes,
  type: '<kebab-name>',
  ...STANDARD_ENTITY_RELS,
};
```

**Barrel:** Add to `packages/serializers/src/configs/<domain>/index.ts`.

## Layer 8: Serializer (Server + Client)

**Server:** `packages/serializers/src/server/<domain>/<name>.serializer.ts`
```typescript
import { buildSerializer } from '@serializers/builders';
import { <camelName>SerializerConfig } from '@serializers/configs';

export const { <PascalName>Serializer } = buildSerializer('server', <camelName>SerializerConfig);
```

**Client:** `packages/serializers/src/client/<domain>/<name>.serializer.ts`
```typescript
import { buildSerializer } from '@serializers/builders';
import { <camelName>SerializerConfig } from '@serializers/configs';

export const { <PascalName>Serializer } = buildSerializer('client', <camelName>SerializerConfig);
```

**Barrel:** Add to `packages/serializers/src/server/<domain>/index.ts` and `client/<domain>/index.ts`.

## Layer 9: API Endpoint Constant

**File:** `packages/constants/src/api.constant.ts`

Add alphabetically to `API_ENDPOINTS`:
```typescript
<SCREAMING_SNAKE>: '/<plural-kebab>',
```

## Layer 10: NestJS Collection

**Directory:** `apps/server/api/src/collections/<plural-kebab>/`

Create these files:

### schemas/<name>.schema.ts
```typescript
export type { <EntityName>, <EntityName> as <EntityName>Document } from '@genfeedai/prisma';
```

### entities/<name>.entity.ts
```typescript
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type { <EntityName> } from '@api/collections/<plural-kebab>/schemas/<name>.schema';

export class <EntityName>Entity extends BaseEntity implements <EntityName> {
  // all Prisma model fields
}
```

### dto/create-<name>.dto.ts
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';

export class Create<EntityName>Dto {
  @ApiProperty({ description: 'Display label', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  label!: string;
  // add fields from arguments
}
```

### dto/update-<name>.dto.ts
```typescript
import { PartialType } from '@nestjs/mapped-types';
import { Create<EntityName>Dto } from './create-<name>.dto';

export class Update<EntityName>Dto extends PartialType(Create<EntityName>Dto) {}
```

### dto/<name>-query.dto.ts
```typescript
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsOptional, IsString } from 'class-validator';

export class <EntityName>QueryDto extends BaseQueryDto {
  @IsOptional() @IsString()
  readonly label?: string;
}
```

### services/<plural-kebab>.service.ts
```typescript
import type { Create<EntityName>Dto } from '@api/collections/<plural-kebab>/dto/create-<name>.dto';
import type { Update<EntityName>Dto } from '@api/collections/<plural-kebab>/dto/update-<name>.dto';
import type { <EntityName>Document } from '@api/collections/<plural-kebab>/schemas/<name>.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class <EntityName>Service extends BaseService<
  <EntityName>Document, Create<EntityName>Dto, Update<EntityName>Dto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, '<camelName>', logger);
  }
}
```

### controllers/<plural-kebab>.controller.ts
```typescript
import type { Create<EntityName>Dto } from '@api/collections/<plural-kebab>/dto/create-<name>.dto';
import type { <EntityName>Document } from '@api/collections/<plural-kebab>/schemas/<name>.schema';
import { <EntityName>Service } from '@api/collections/<plural-kebab>/services/<plural-kebab>.service';
import type { Update<EntityName>Dto } from '@api/collections/<plural-kebab>/dto/update-<name>.dto';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { <PascalName>Serializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller } from '@nestjs/common';

@AutoSwagger()
@Controller('<plural-kebab>')
export class <EntityName>Controller extends BaseCRUDController<
  <EntityName>Document, Create<EntityName>Dto, Update<EntityName>Dto
> {
  constructor(
    readonly logger: LoggerService,
    readonly service: <EntityName>Service,
  ) {
    super(logger, service, <PascalName>Serializer, '<EntityName>');
  }
}
```

### <plural-kebab>.module.ts
```typescript
import { <EntityName>Controller } from '@api/collections/<plural-kebab>/controllers/<plural-kebab>.controller';
import { <EntityName>Service } from '@api/collections/<plural-kebab>/services/<plural-kebab>.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [<EntityName>Controller],
  exports: [<EntityName>Service],
  imports: [],
  providers: [<EntityName>Service],
})
export class <EntityName>Module {}
```

## Layer 11: Register Module in AppModule

**File:** `apps/server/api/src/app.module.ts`

Add import (alphabetical):
```typescript
import { <EntityName>Module } from '@api/collections/<plural-kebab>/<plural-kebab>.module';
```

Add to `imports` array (alphabetical):
```typescript
<EntityName>Module,
```

## Layer 12: Frontend Service

**File:** `packages/services/<domain>/<plural-kebab>.service.ts`

```typescript
import { API_ENDPOINTS } from '@genfeedai/constants';
import { <EntityName> } from '@genfeedai/models/<domain>/<name>.model';
import { <PascalName>Serializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class <EntityName>Service extends BaseService<<EntityName>> {
  constructor(token: string) {
    super(API_ENDPOINTS.<SCREAMING_SNAKE>, token, <EntityName>, <PascalName>Serializer);
  }

  public static getInstance(token: string): <EntityName>Service {
    return BaseService.getDataServiceInstance(<EntityName>Service, token) as <EntityName>Service;
  }
}
```

## Layer 13: React Hook

**File:** `packages/hooks/data/<domain>/use-<plural-kebab>/use-<plural-kebab>.ts`

```typescript
'use client';

import { <EntityName>Service } from '@genfeedai/services/<domain>/<plural-kebab>.service';
import type { I<EntityName> } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { useAuth } from '@clerk/nextjs';
import { useBrand } from '@contexts/user/brand-context/brand-context';

export interface Use<EntityName>Options {
  autoLoad?: boolean;
}

export function use<EntityName>(options: Use<EntityName>Options = {}) {
  const { autoLoad = true } = options;
  const { isSignedIn } = useAuth();
  const { brandId } = useBrand();

  const getService = useAuthedService((token: string) =>
    <EntityName>Service.getInstance(token),
  );

  const { data, isLoading, error, refresh } = useResource(
    async () => {
      const service = await getService();
      const params: Record<string, string> = {};
      if (brandId) params.brand = brandId;
      return (await service.findAll(params)) as I<EntityName>[];
    },
    {
      defaultValue: [] as I<EntityName>[],
      dependencies: [brandId],
      enabled: autoLoad && !!isSignedIn,
    },
  );

  return { data, error, isLoading, refresh };
}
```

**Barrel:** Create `packages/hooks/data/<domain>/use-<plural-kebab>/index.ts`:
```typescript
export * from './use-<plural-kebab>';
```

## Post-Scaffold

```bash
# Format
npx biome check --write .

# Type check
bun type-check

# Test changed packages
bun run test --filter=@genfeedai/enums
bun run test --filter=@genfeedai/interfaces
bun run test --filter=@genfeedai/client
bun run test --filter=@genfeedai/models
bun run test --filter=@genfeedai/serializers
bun run test --filter=@genfeedai/constants
bun run test --filter=@genfeedai/api
```

## Layer Dependency Order (strict)

```
1. schema.prisma + prisma migrate dev
2. packages/enums (if needed)
3. packages/interfaces
4. packages/client/models
5. packages/models
6. packages/serializers/attributes
7. packages/serializers/configs
8. packages/serializers/server + client
9. packages/constants
10. apps/server/api/collections
11. apps/server/api/app.module.ts
12. packages/services
13. packages/hooks
```

Do not reorder. Later layers import from earlier layers.
