# Filter Utilities Documentation

This document describes the filter utility classes created to eliminate duplicate filtering logic across controllers.

## Overview

Five main filter utilities have been created:

1. **CollectionFilterUtil** - Common filtering patterns across all collections
2. **ArticleFilterUtil** - Article-specific filtering patterns
3. **PresetFilterUtil** - Preset-specific three-tier scope filtering
4. **TemplateFilterUtil** - Template-specific filtering patterns
5. **PipelineBuilder** - Type-safe MongoDB aggregation pipeline builder

These utilities follow the pattern established by `IngredientFilterUtil`, which successfully eliminated duplicate code across video, image, and music controllers.

---

## 0. PipelineBuilder

**Location:** `@api/shared/utils/pipeline-builder/pipeline-builder.util.ts`

**Purpose:** Provides type-safe MongoDB aggregation pipeline building to replace `const matchStage: any` patterns with consistent, type-safe alternatives.

### Key Features

- **Static methods** for building individual stages (consistent with existing filter utilities)
- **Builder pattern** for fluent chaining when building complex pipelines
- **Type-safe** match conditions (no `any` types)

### Static Methods

#### `buildMatch(conditions)`

Builds a `$match` stage from conditions object.

```typescript
import { PipelineBuilder } from '@api/shared/utils/pipeline-builder/pipeline-builder.util';

// Simple match stage
const matchStage = PipelineBuilder.buildMatch({ 
  isDeleted: false,
  status: 'active' 
});

// Returns: { $match: { isDeleted: false, status: 'active' } }
```

#### `buildSort(sort)`

Builds a `$sort` stage.

```typescript
const sortStage = PipelineBuilder.buildSort({ createdAt: -1, label: 1 });
// Returns: { $sort: { createdAt: -1, label: 1 } }
```

### Builder Pattern

For complex pipelines, use the fluent builder:

```typescript
const pipeline = PipelineBuilder.create()
  .match({ isDeleted: false })
  .matchIf(condition, { status: 'active' })  // Conditionally add match
  .sort({ createdAt: -1 })
  .lookup({ 
    from: 'users', 
    localField: 'userId', 
    foreignField: '_id', 
    as: 'user' 
  })
  .build();

// Returns: PipelineStage[]
```

**Replaces:**

```typescript
// OLD - Type-unsafe pattern
const matchStage: any = { isDeleted: false };
if (condition) matchStage.status = 'active';
const pipeline = [{ $match: matchStage }, { $sort: { createdAt: -1 } }];
```

**New - Type-safe pattern:**

```typescript
// Option 1: Static method approach (consistent with existing utils)
const matchStage = PipelineBuilder.buildMatch({ 
  isDeleted: false,
  ...(condition && { status: 'active' })
});
const pipeline = [matchStage, PipelineBuilder.buildSort({ createdAt: -1 })];

// Option 2: Builder approach (for complex pipelines)
const pipeline = PipelineBuilder.create()
  .match({ isDeleted: false })
  .matchIf(condition, { status: 'active' })
  .sort({ createdAt: -1 })
  .build();
```

### Match Conditions Merging

Multiple `.match()` calls are automatically merged into a single `$match` stage:

```typescript
const pipeline = PipelineBuilder.create()
  .match({ isDeleted: false })
  .match({ status: 'active' })
  .build();

// Results in: [{ $match: { isDeleted: false, status: 'active' } }]
```

### Supported Operators

The `MatchConditions` type supports all common MongoDB query operators:

- Comparison: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`
- Logical: `$or`, `$and`, `$nor`, `$not`
- Element: `$exists`, `$type`
- Evaluation: `$regex`, `$options`
- Array: `$all`, `$elemMatch`, `$size`

**Example with operators:**

```typescript
const pipeline = PipelineBuilder.create()
  .match({
    isDeleted: false,
    $or: [
      { status: 'active' },
      { status: 'pending' }
    ],
    createdAt: { $gte: new Date('2024-01-01') },
    label: { $regex: 'test', $options: 'i' }
  })
  .build();
```

---

## 1. CollectionFilterUtil

**Location:** `@api/helpers/utils/collection-filter/collection-filter.util.ts`

**Purpose:** Provides common filtering patterns used across most collection controllers.

### Key Methods

#### `buildBrandFilter(brand, publicMetadata, defaultTo)`

Handles brand filtering with fallback logic.

```typescript
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter';

// Specific brand
const brand = CollectionFilterUtil.buildBrandFilter(
  query.brand,
  publicMetadata,
  'user',
);

// Returns: ObjectId(query.brand) if valid, else ObjectId(publicMetadata.brand)
```

**Replaces:**

```typescript
// OLD - Repeated in Videos, Images, Musics controllers
const brand = isValidObjectId(query.brand)
  ? new Types.ObjectId(query.brand)
  : new Types.ObjectId(publicMetadata.brand);
```

#### `buildScopeFilter(scope)`

Handles scope filtering (public/private/organization).

```typescript
const scope = CollectionFilterUtil.buildScopeFilter(query.scope);
// Returns: query.scope or { $ne: null }
```

#### `buildSearchFilter(search, fields)`

Creates case-insensitive regex search across multiple fields.

```typescript
const searchStages = CollectionFilterUtil.buildSearchFilter(query.search, [
  'metadata.label',
  'metadata.description',
  'content',
]);

// Returns: [{ $match: { $or: [{ field1: { $regex: ..., $options: 'i' } }, ...] } }]
```

**Replaces:**

```typescript
// OLD - Repeated in Videos, Images, Musics controllers
...(query.search ? [
  {
    $match: {
      $or: [
        { 'metadata.label': { $regex: query.search, $options: 'i' } },
        { 'metadata.description': { $regex: query.search, $options: 'i' } },
      ]
    }
  }
] : [])
```

#### `buildOwnershipFilter(publicMetadata, options)`

Creates user/organization ownership filter.

```typescript
const ownershipFilter =
  CollectionFilterUtil.buildOwnershipFilter(publicMetadata);

// Returns: { $or: [
//   { user: ObjectId(...) },
//   { organization: ObjectId(...) }
// ] }
```

#### `buildDateRangeFilter(startDate, endDate, field)`

Creates date range filter for analytics and reports.

```typescript
const dateFilter = CollectionFilterUtil.buildDateRangeFilter(
  '2024-01-01',
  '2024-12-31',
  'createdAt',
);

// Returns: { createdAt: { $gte: Date(...), $lte: Date(...) } }
```

#### `buildArrayFilter(values, field, matchAll)`

Creates array filters for tags, industries, platforms, etc.

```typescript
// Match any
const tagFilter = CollectionFilterUtil.buildArrayFilter(
  ['tag1', 'tag2'],
  'tags',
  false,
);
// Returns: { tags: { $in: ['tag1', 'tag2'] } }

// Match all
const tagFilter = CollectionFilterUtil.buildArrayFilter(
  ['tag1', 'tag2'],
  'tags',
  true,
);
// Returns: { tags: { $all: ['tag1', 'tag2'] } }
```

#### `buildCategoryFilter(category)`

Creates category filter (single or multiple).

```typescript
const categoryFilter = CollectionFilterUtil.buildCategoryFilter('video');
// Returns: { category: 'video' }

const categoryFilter = CollectionFilterUtil.buildCategoryFilter([
  'image',
  'video',
]);
// Returns: { category: { $in: ['image', 'video'] } }
```

#### `conditionalStages(condition, stages)`

Returns pipeline stages conditionally (useful for lightweight queries).

```typescript
const pipeline = [
  { $match: { ...baseMatch } },
  ...CollectionFilterUtil.conditionalStages(!query.lightweight, [
    { $lookup: { from: 'votes', ... } },
    { $lookup: { from: 'children', ... } }
  ])
];
```

**Replaces:**

```typescript
// OLD
...(query.lightweight ? [] : [
  { $lookup: { from: 'votes', ... } },
  { $lookup: { from: 'children', ... } }
])
```

#### `buildBooleanFilter(value, defaultValue)`

Parses boolean query params correctly (avoids Boolean('false') === true).

```typescript
const isActive = CollectionFilterUtil.buildBooleanFilter(query.isActive);
// Correctly returns false for 'false' string
```

#### `buildSortObject(sort, defaultSort)`

Converts sort query param to MongoDB sort object.

```typescript
const sort = CollectionFilterUtil.buildSortObject(query.sort, {
  createdAt: -1,
});
// query.sort = '-createdAt,label'
// Returns: { createdAt: -1, label: 1 }
```

#### `buildPaginationOptions(query, customLabels)`

Creates pagination options for mongoose-paginate-v2.

```typescript
const options = CollectionFilterUtil.buildPaginationOptions(
  query,
  customLabels,
);
// Returns: { page: 1, limit: 50, pagination: true, customLabels: {...} }
```

---

## 2. ArticleFilterUtil

**Location:** `@api/helpers/utils/article-filter/article-filter.util.ts`

**Purpose:** Provides article-specific filtering patterns.

### Key Methods

#### `buildArticleStatusFilter(status)`

Handles special DRAFT status (includes PROCESSING).

```typescript
import { ArticleFilterUtil } from '@api/helpers/utils/article-filter';

const statusStages = ArticleFilterUtil.buildArticleStatusFilter(
  ArticleStatus.DRAFT,
);

// Returns: [{ $match: { status: { $in: [ArticleStatus.DRAFT, ArticleStatus.PROCESSING] } } }]
```

**Replaces:**

```typescript
// OLD - in articles.controller.ts
if (query.status === ArticleStatus.DRAFT) {
  pipeline.push({
    $match: {
      status: { $in: [ArticleStatus.DRAFT, ArticleStatus.PROCESSING] },
    },
  });
}
```

#### `buildCategoryFilter(category)`

Creates category filter for articles.

```typescript
const categoryStages = ArticleFilterUtil.buildCategoryFilter(query.category);
```

#### `buildTagFilter(tagId)`

Creates tag filter with ObjectId conversion.

```typescript
const tagFilter = ArticleFilterUtil.buildTagFilter(query.tag);
// Returns: { tags: ObjectId(query.tag) }
```

#### `buildContentSearchFilter(search)`

Searches across label, summary, and content fields.

```typescript
const searchStages = ArticleFilterUtil.buildContentSearchFilter(query.search);

// Returns: [{ $match: { $or: [
//   { label: { $regex: 'search', $options: 'i' } },
//   { summary: { $regex: 'search', $options: 'i' } },
//   { content: { $regex: 'search', $options: 'i' } }
// ] } }]
```

#### `buildTagPopulation(includeFields)`

Populates article tags with projection.

```typescript
const tagStages = ArticleFilterUtil.buildTagPopulation(['slug', 'description']);

// Returns: [{ $lookup: {
//   from: 'tags',
//   localField: 'tags',
//   foreignField: '_id',
//   as: 'tags',
//   pipeline: [{ $project: { _id: 1, label: 1, backgroundColor: 1, textColor: 1, slug: 1, description: 1 } }]
// } }]
```

#### `buildArticlePipeline(query, baseMatch)`

Combines all article filters into a complete pipeline.

```typescript
const pipeline = ArticleFilterUtil.buildArticlePipeline(query, {
  user: new Types.ObjectId(publicMetadata.user),
  organization: new Types.ObjectId(publicMetadata.organization),
  brand: new Types.ObjectId(publicMetadata.brand),
  isDeleted: false,
});
```

---

## 3. PresetFilterUtil

**Location:** `@api/helpers/utils/preset-filter/preset-filter.util.ts`

**Purpose:** Provides preset-specific three-tier scope filtering.

### Key Methods

#### `buildScopeOrConditions(publicMetadata)`

Builds three-tier scope filtering (global, org, user).

```typescript
import { PresetFilterUtil } from '@api/helpers/utils/preset-filter';

const orConditions = PresetFilterUtil.buildScopeOrConditions(publicMetadata);

// Returns: [
//   { organization: { $exists: false }, user: { $exists: false } }, // global
//   { organization: ObjectId(publicMetadata.organization) },         // org
//   { user: ObjectId(publicMetadata.user) }                          // user
// ]
```

**Replaces:**

```typescript
// OLD - in presets.controller.ts
const orConditions: any[] = [
  { organization: { $exists: false }, user: { $exists: false } },
];
if (publicMetadata.organization) {
  orConditions.push({
    organization: new Types.ObjectId(publicMetadata.organization),
  });
}
if (publicMetadata.user) {
  orConditions.push({ user: new Types.ObjectId(publicMetadata.user) });
}
```

#### `canUserModifyPreset(user, preset)`

Checks if user can modify preset (permission logic).

```typescript
const canModify = PresetFilterUtil.canUserModifyPreset(user, preset);

// Returns: true if superadmin OR user's organization matches preset organization
```

**Replaces:**

```typescript
// OLD - in presets.controller.ts
public canUserModifyEntity(user: User, entity: any): boolean {
  const publicMetadata = getPublicMetadata(user);
  if (publicMetadata.isSuperAdmin) {
    return true;
  }
  if (!entity.organization) {
    return false;
  }
  const entityOrgId = entity.organization?.toString();
  return entityOrgId === publicMetadata.organization;
}
```

#### `enrichPresetDto(createDto, user)`

Enriches preset create DTO with proper organization/brand/user.

```typescript
const enrichedDto = PresetFilterUtil.enrichPresetDto(createDto, user);

// Handles different logic for superadmins vs regular users
```

**Replaces:**

```typescript
// OLD - in presets.controller.ts (28 lines of logic)
public enrichCreateDto(createDto: CreatePresetDto, user: User): CreatePresetDto {
  const publicMetadata = getPublicMetadata(user);
  const enriched: any = { ...createDto };

  if (!publicMetadata.isSuperAdmin) {
    enriched.organization = new Types.ObjectId(publicMetadata.organization);
    // ... more logic
  } else {
    // ... different logic for superadmins
  }

  return enriched;
}
```

#### `buildBaseMatch(publicMetadata, query, isDeleted)`

Creates base match stage with three-tier scope and filters.

```typescript
const matchStage = PresetFilterUtil.buildBaseMatch(
  publicMetadata,
  { category: 'video', isActive: true },
  false,
);
```

---

## 4. TemplateFilterUtil

**Location:** `@api/helpers/utils/template-filter/template-filter.util.ts`

**Purpose:** Provides template-specific filtering patterns.

### Key Methods

#### `buildTemplateFilters(query)`

Converts query DTO to filters object for service layer.

```typescript
import { TemplateFilterUtil } from '@api/helpers/utils/template-filter';

const filters = TemplateFilterUtil.buildTemplateFilters(query);

// Handles single-to-array conversions:
// query.industry = 'tech' → filters.industries = ['tech']
// query.platform = 'instagram' → filters.platforms = ['instagram']
```

**Replaces:**

```typescript
// OLD - in templates.controller.ts
const templates = await this.templatesService.findAll(organization, {
  purpose: query.purpose,
  key: query.key,
  category: query.category,
  industries: query.industry ? [query.industry] : undefined,
  platforms: query.platform ? [query.platform] : undefined,
  scope: query.scope,
  isFeatured: query.isFeatured ? query.isFeatured === 'true' : undefined,
  search: query.search,
});
```

#### `buildArrayInFilter(field, values)`

Creates $in filter for array fields.

```typescript
const industryStages = TemplateFilterUtil.buildArrayInFilter('industries', [
  'technology',
  'finance',
]);

// Returns: [{ $match: { industries: { $in: ['technology', 'finance'] } } }]
```

#### `parseFeaturedFilter(value)`

Parses featured boolean correctly.

```typescript
const isFeatured = TemplateFilterUtil.parseFeaturedFilter(query.isFeatured);
// Correctly handles 'false' string
```

#### `buildPurposeFilter(purpose)`

Creates filter for template purpose (content/prompt).

```typescript
const purposeFilter = TemplateFilterUtil.buildPurposeFilter('prompt');
// Returns: { purpose: 'prompt' }
```

#### `buildKeyFilter(key)`

Creates filter for template key.

```typescript
const keyFilter = TemplateFilterUtil.buildKeyFilter('system-prompt');
// Returns: { key: 'system-prompt' }
```

#### `buildTemplatePipeline(query, baseMatch)`

Combines all template filters into a complete pipeline.

```typescript
const pipeline = TemplateFilterUtil.buildTemplatePipeline(query, {
  organization: ObjectId(...),
  isDeleted: false
});
```

---

## Usage Examples

### Example 1: Using CollectionFilterUtil in a Controller

```typescript
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults';

// In your controller's findAll method:
const publicMetadata = getPublicMetadata(user);
const status = QueryDefaultsUtil.parseStatusFilter(query.status);
const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

// Use CollectionFilterUtil for common filters
const brand = CollectionFilterUtil.buildBrandFilter(query.brand, publicMetadata);
const scope = CollectionFilterUtil.buildScopeFilter(query.scope);
const ownershipFilter = CollectionFilterUtil.buildOwnershipFilter(publicMetadata);

const pipeline: PipelineStage[] = [
  {
    $match: {
      ...ownershipFilter,
      category: IngredientCategory.VIDEO,
      isDeleted,
      scope,
      status,
      brand,
    }
  },
  ...CollectionFilterUtil.buildSearchFilter(query.search, ['metadata.label', 'metadata.description']),
  ...CollectionFilterUtil.conditionalStages(!query.lightweight, [
    { $lookup: { from: 'votes', ... } },
    { $lookup: { from: 'children', ... } }
  ])
];
```

### Example 2: Using ArticleFilterUtil in Articles Controller

```typescript
import { ArticleFilterUtil } from '@api/helpers/utils/article-filter';

// Replace buildFindAllPipeline method:
public buildFindAllPipeline(
  user: User,
  query: ArticlesQueryDto,
  isDeleted: boolean,
): PipelineStage[] {
  const publicMetadata = getPublicMetadata(user);

  // Use ArticleFilterUtil for complete pipeline
  return ArticleFilterUtil.buildArticlePipeline(query, {
    user: new Types.ObjectId(publicMetadata.user),
    organization: new Types.ObjectId(publicMetadata.organization),
    brand: new Types.ObjectId(publicMetadata.brand),
    isDeleted,
  });
}
```

### Example 3: Using PresetFilterUtil in Presets Controller

```typescript
import { PresetFilterUtil } from '@api/helpers/utils/preset-filter';

// Replace buildFindAllPipeline method:
public buildFindAllPipeline(
  user: User,
  query: PresetsQueryDto,
  isDeleted: boolean,
): PipelineStage[] {
  const publicMetadata = getPublicMetadata(user);

  const matchStage = PresetFilterUtil.buildBaseMatch(
    publicMetadata,
    {
      category: query.category,
      isActive: query.isActive,
      isFavorite: query.isFavorite,
    },
    isDeleted
  );

  return [
    { $match: matchStage },
    { $sort: query.sort ? handleQuerySort(query.sort) : { label: 1 } }
  ];
}

// Replace enrichCreateDto method:
public enrichCreateDto(createDto: CreatePresetDto, user: User): CreatePresetDto {
  return PresetFilterUtil.enrichPresetDto(createDto, user);
}

// Replace canUserModifyEntity method:
public canUserModifyEntity(user: User, entity: any): boolean {
  return PresetFilterUtil.canUserModifyPreset(user, entity);
}
```

### Example 4: Using TemplateFilterUtil in Templates Controller

```typescript
import { TemplateFilterUtil } from '@api/helpers/utils/template-filter';

// In controller's findAll method:
@Get()
async findAll(@CurrentUser() user: User, @Query() query: TemplatesQueryDto) {
  const { organization } = getPublicMetadata(user);

  // Use TemplateFilterUtil to build filters
  const filters = TemplateFilterUtil.buildTemplateFilters(query);

  const templates = await this.templatesService.findAll(organization, filters);

  return TemplateSerializer.serialize(templates);
}
```

---

## Benefits

### Code Reduction

- **CollectionFilterUtil**: Eliminates 200+ lines of duplicate code across controllers
- **ArticleFilterUtil**: Reduces articles controller by ~50 lines
- **PresetFilterUtil**: Reduces presets controller by ~40 lines
- **TemplateFilterUtil**: Reduces templates controller by ~20 lines

### Consistency

- All controllers use the same filtering logic
- Reduces chance of bugs from inconsistent implementations
- Easier to maintain and update filter logic

### Testability

- Each utility can be unit tested independently
- Controllers become thinner and more focused

### Reusability

- Methods can be used across any controller
- Mix and match methods as needed
- Easy to extend with new methods

---

## Migration Guide

To migrate existing controllers to use these utilities:

1. **Identify duplicate filter patterns** in your controller
2. **Replace with appropriate utility method**:
   - Brand filtering → `CollectionFilterUtil.buildBrandFilter()`
   - Scope filtering → `CollectionFilterUtil.buildScopeFilter()`
   - Search filtering → `CollectionFilterUtil.buildSearchFilter()` or `ArticleFilterUtil.buildContentSearchFilter()`
   - Ownership filtering → `CollectionFilterUtil.buildOwnershipFilter()`
   - Date range → `CollectionFilterUtil.buildDateRangeFilter()`
   - Array filters → `CollectionFilterUtil.buildArrayFilter()` or `TemplateFilterUtil.buildArrayInFilter()`
3. **Test thoroughly** to ensure behavior is unchanged
4. **Remove old code** once tests pass

---

## Related Utilities

These utilities work well with existing utilities:

- **QueryDefaultsUtil**: Status parsing, pagination defaults, boolean parsing
- **IngredientFilterUtil**: Ingredient-specific filters (parent, folder, training, format)
- **AssetScopeFilterUtil**: Scope-based permission filtering

## 5. TrainingFilterUtil

**Location:** `@api/helpers/utils/training-filter/training-filter.util.ts`

**Purpose:** Provides training-specific filtering patterns and lookups.

### Key Methods

#### `buildSourceImagesLookup(options)`

Creates complete $lookup stage for finding ingredient source images for a training.

```typescript
import { TrainingFilterUtil } from '@api/helpers/utils/training-filter';

const sourceLookup = TrainingFilterUtil.buildSourceImagesLookup({
  sourceIdsVar: '$sources',
  userIdVar: '$user',
  as: 'sourceImages',
});
```

**Replaces:**

```typescript
// OLD - Easy to forget filters
{
  $lookup: {
    from: 'ingredients',
    pipeline: [
      {
        $match: {
          $expr: {
            $and: [
              { $eq: ['$category', IngredientCategory.IMAGE] },
              { $in: ['$_id', '$$sourceIds'] },
              // Forgot isDeleted filter! ❌
            ],
          },
        },
      },
    ],
  },
}
```

#### `buildGeneratedImagesLookup(options)`

Creates complete $lookup stage for finding ingredients generated by a training model.

```typescript
const generatedLookup = TrainingFilterUtil.buildGeneratedImagesLookup({
  metadataIdsVar: '$metadataWithModel._id',
  as: 'generatedImages',
});
```

---

## Future Enhancements

Potential additions to these utilities:

1. **GeoFilterUtil** - Location-based filtering
2. **TimeRangeFilterUtil** - Advanced time-based queries
3. **AggregationFilterUtil** - Common aggregation patterns
4. **PermissionFilterUtil** - Role-based access filtering

---

## Questions?

For issues or suggestions, please reach out to the development team or create a GitHub issue.
