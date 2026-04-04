# IngredientFilterUtil

A utility class that provides consistent, reusable filter builders for ingredient queries across all ingredient controllers (videos, images, organizations, etc.).

## Problem Solved

Before this utility, every controller (videos, images, organizations, etc.) had duplicate filter logic for common ingredient query patterns:
- Parent filtering (root vs. child ingredients)
- Folder filtering (root level vs. specific folder)
- Training filtering (exclude training ingredients by default)
- Format filtering (square, landscape, portrait)
- Metadata and prompt lookups

This led to:
- 🔴 **Code duplication** - Same logic repeated in 3+ places
- 🔴 **Inconsistency** - Small differences in implementation between controllers
- 🔴 **Maintenance burden** - Bug fixes needed to be applied multiple times
- 🔴 **Testing difficulty** - Same logic tested separately in multiple places

## Solution

`IngredientFilterUtil` centralizes all common ingredient filtering logic into a single, well-tested utility class.

## Features

### Filter Builders

#### 1. `buildParentFilter(parent)`
Handles filtering by parent ingredient ID:
- `null` or `'null'` → Root ingredients only (parent doesn't exist)
- Valid ObjectId → Ingredients with that specific parent
- `undefined` → Defaults to root ingredients

```typescript
const parentConditions = IngredientFilterUtil.buildParentFilter(query.parent);
// Returns: { parent: { $exists: false } } or { parent: ObjectId(...) }
```

#### 2. `buildFolderFilter(folder)`
Handles filtering by folder ID:
- `null`, `'null'`, `''` → Root level (no folder)
- Valid ObjectId → Ingredients in that folder
- `undefined` → Defaults to root level

```typescript
const folderConditions = IngredientFilterUtil.buildFolderFilter(query.folder);
// Returns: { folder: { $exists: false } } or { folder: ObjectId(...) }
```

#### 3. `buildTrainingFilter(training)`
Handles filtering by training ID:
- Valid ObjectId → Ingredients for that training
- `undefined` → Exclude training ingredients (default)

```typescript
const trainingFilter = IngredientFilterUtil.buildTrainingFilter(query.training);
// Returns: { training: { $exists: false } } or { training: ObjectId(...) }
```

#### 4. `buildFormatFilterStage(format)`
Returns aggregation pipeline stages for format filtering.

**IMPORTANT**: Must be applied **AFTER** metadata lookup since it compares `metadata.width` and `metadata.height`.

- `'square'` → width === height
- `'landscape'` → width > height
- `'portrait'` → width < height

```typescript
const formatStages = IngredientFilterUtil.buildFormatFilterStage(query.format);
// Returns: [{ $match: { $expr: { $lt: ['$metadata.width', '$metadata.height'] } } }]
```

#### 5. `buildBrandFilter(brand)`
Handles brand filtering:
- Valid ObjectId → Specific brand
- `undefined` → Any brand (exists)

```typescript
const brand = IngredientFilterUtil.buildBrandFilter(query.brand);
// Returns: ObjectId(...) or { $exists: true }
```

### Pipeline Stage Builders

#### 6. `buildMetadataLookup()`
Returns standard metadata lookup stages used across all ingredient controllers.

```typescript
const metadataStages = IngredientFilterUtil.buildMetadataLookup();
// Returns: [$lookup metadata, $unwind metadata]
```

#### 7. `buildPromptLookup(lightweight?)`
Returns standard prompt lookup stages. Skips lookup if `lightweight` is true (for gallery views).

```typescript
const promptStages = IngredientFilterUtil.buildPromptLookup(query.lightweight);
// Returns: [$lookup prompts, $unwind prompts] or []
```

#### 8. `buildIngredientPipeline(query, baseMatch)`
Combines all common filters into a complete aggregation pipeline. Useful for simple ingredient listing endpoints.

```typescript
const pipeline = IngredientFilterUtil.buildIngredientPipeline(
  query,
  {
    user: new Types.ObjectId(userId),
    category: IngredientCategory.VIDEO,
    isDeleted: false
  }
);
```

## Usage Examples

### Before (Videos Controller - Duplicated Logic)

```typescript
// Build parent filter conditions
let parentConditions: Record<string, any> = {};
if (Object.prototype.hasOwnProperty.call(query, 'parent')) {
  if (query.parent === null) {
    parentConditions = { parent: { $exists: false } };
  } else if (isValidObjectId(query.parent)) {
    parentConditions = { parent: new Types.ObjectId(query.parent) };
  } else {
    parentConditions = { parent: { $exists: false } };
  }
} else {
  parentConditions = { parent: { $exists: false } };
}

// Build folder filter conditions
let folderConditions: Record<string, any> = {};
if (Object.prototype.hasOwnProperty.call(query, 'folder')) {
  if (isValidObjectId(query.folder)) {
    folderConditions = { folder: new Types.ObjectId(query.folder) };
  } else {
    folderConditions = { folder: { $exists: false } };
  }
} else {
  folderConditions = { folder: { $exists: false } };
}

// Build training filter
let trainingFilter: Record<string, any> = { training: { $exists: false } };
if (query.training) {
  if (isValidObjectId(query.training)) {
    trainingFilter = { training: new Types.ObjectId(query.training) };
  } else {
    trainingFilter = { training: { $exists: false } };
  }
}

const aggregate: PipelineStage[] = [
  { $match: { ...matchStage, ...parentConditions, ...folderConditions, ...trainingFilter } },
  {
    $lookup: {
      from: 'metadata',
      localField: 'metadata',
      foreignField: '_id',
      as: 'metadata',
    },
  },
  { $unwind: { path: '$metadata', preserveNullAndEmptyArrays: true } },
  ...(query.format && query.format !== ''
    ? [{
        $match: query.format === 'square'
          ? { $expr: { $eq: ['$metadata.width', '$metadata.height'] } }
          : query.format === 'landscape'
            ? { $expr: { $gt: ['$metadata.width', '$metadata.height'] } }
            : query.format === 'portrait'
              ? { $expr: { $lt: ['$metadata.width', '$metadata.height'] } }
              : {}
      }]
    : []),
  // ... more stages
];
```

### After (Videos Controller - Clean & DRY)

```typescript
// Use helper to build common ingredient filters
const parentConditions = IngredientFilterUtil.buildParentFilter(query.parent);
const folderConditions = IngredientFilterUtil.buildFolderFilter(query.folder);
const trainingFilter = IngredientFilterUtil.buildTrainingFilter(query.training);

const aggregate: PipelineStage[] = [
  {
    $match: {
      $and: [matchStage, parentConditions, folderConditions, trainingFilter],
    },
  },
  ...IngredientFilterUtil.buildMetadataLookup(),
  ...IngredientFilterUtil.buildFormatFilterStage(query.format),
  ...IngredientFilterUtil.buildPromptLookup(),
  // ... more stages
];
```

### Organizations Controller Example

```typescript
const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
const matchStage: any = {
  organization: new Types.ObjectId(id),
  isDeleted,
};

// Add other filters (search, status, type, brand)
if (query.search) {
  matchStage.$or = [
    { label: { $regex: query.search, $options: 'i' } },
    { description: { $regex: query.search, $options: 'i' } },
  ];
}

// Use helper for common filters
const parentConditions = IngredientFilterUtil.buildParentFilter(query.parent);

const aggregate: PipelineStage[] = [
  { $match: { $and: [matchStage, parentConditions] } },
  ...IngredientFilterUtil.buildMetadataLookup(),
  ...IngredientFilterUtil.buildFormatFilterStage(query.format),
  { $sort: handleQuerySort(query.sort) },
];
```

## Benefits

✅ **DRY Principle** - Single source of truth for filter logic
✅ **Consistency** - Same behavior across all controllers
✅ **Maintainability** - Fix bugs in one place
✅ **Testability** - Comprehensive unit tests in one place
✅ **Readability** - Cleaner, more concise controller code
✅ **Type Safety** - Full TypeScript support
✅ **Documentation** - Well-documented with JSDoc comments

## Refactored Controllers

The following controllers have been refactored to use `IngredientFilterUtil`:

- ✅ `OrganizationsController.findAllIngredients()` - `apps/server/api/src/collections/organizations/controllers/organizations.controller.ts:289-378`
- ✅ `VideosController.findAll()` - `apps/server/api/src/collections/videos/controllers/videos.controller.ts:222-537`
- ✅ `ImagesController.findAll()` - `apps/server/api/src/collections/images/controllers/images.controller.ts:216-537`

## Testing

Run the unit tests:

```bash
npm test ingredient-filter.util.spec.ts
```

The test suite covers all filter builders with various input scenarios.

## Future Enhancements

Potential additions to consider:
- `buildScopeFilter()` - For scope/visibility filtering
- `buildStatusFilter()` - For status filtering (with comma-separated support)
- `buildSearchFilter()` - For text search across multiple fields
- `buildVotesLookup()` - For vote counting aggregation
- `buildChildrenCountLookup()` - For counting child ingredients

## Migration Guide

To migrate existing controllers to use `IngredientFilterUtil`:

1. Add import:
```typescript
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter';
```

2. Replace parent filter logic:
```typescript
// Before
let parentConditions = {};
if (Object.prototype.hasOwnProperty.call(query, 'parent')) {
  // ... lots of logic
}

// After
const parentConditions = IngredientFilterUtil.buildParentFilter(query.parent);
```

3. Replace folder filter logic:
```typescript
const folderConditions = IngredientFilterUtil.buildFolderFilter(query.folder);
```

4. Replace training filter logic:
```typescript
const trainingFilter = IngredientFilterUtil.buildTrainingFilter(query.training);
```

5. Replace metadata/prompt lookups:
```typescript
// Before
{ $lookup: { from: 'metadata', ... } },
{ $unwind: { path: '$metadata', ... } },

// After
...IngredientFilterUtil.buildMetadataLookup(),
```

6. Replace format filter:
```typescript
// Before
...(query.format && query.format !== ''
  ? [{ $match: query.format === 'square' ? ... }]
  : []),

// After
...IngredientFilterUtil.buildFormatFilterStage(query.format),
```

## Related Files

- Implementation: `ingredient-filter.util.ts`
- Tests: `ingredient-filter.util.spec.ts`
- Export: `index.ts`
