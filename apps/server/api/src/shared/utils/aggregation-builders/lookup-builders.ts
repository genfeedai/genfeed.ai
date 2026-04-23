import type {
  ChildrenLookupOptions,
  LookupOptions,
  MultiPipelineStage,
  PipelineStage,
  SinglePipelineStage,
} from '@api/shared/utils/aggregation-builders/pipeline.types';

type LookupPipeline = PipelineStage[];
type LookupStage = { $lookup: Record<string, unknown> };

/**
 * Default projection fields for each entity type
 */
const DEFAULT_FIELDS = {
  brand: ['_id', 'label', 'handle'],
  credential: ['_id', 'platform', 'externalHandle'],
  ingredients: ['_id', 'category', 'status'],
  metadata: ['_id', 'width', 'height', 'duration', 'size', 'extension'],
  organization: ['_id', 'label'],
  user: ['_id', 'handle', 'firstName', 'lastName', 'email'],
};

/**
 * Build a $project stage from field names
 * Returns a fresh object each call to avoid race conditions
 */
function buildProjection(fields: string[]): Record<string, 1> {
  const projection: Record<string, 1> = {};
  for (const field of fields) {
    projection[field] = 1;
  }
  return projection;
}

function withLookupPipeline(
  stage: LookupStage,
  pipeline: LookupPipeline,
): LookupStage {
  return {
    ...stage,
    $lookup: {
      ...stage.$lookup,
      pipeline,
    },
  };
}

/**
 * Ingredients lookup
 * Returns a $lookup stage for populating ingredients array
 *
 * @example
 * const pipeline = [
 *   { $match: { ... } },
 *   ingredientsLookup(),
 * ];
 */
export function ingredientsLookup(
  options?: LookupOptions,
): SinglePipelineStage {
  const fields = options?.fields ?? [...DEFAULT_FIELDS.ingredients];
  const localField = options?.localField ?? 'ingredients';
  const asField = options?.asField ?? 'ingredients';

  // Build fresh pipeline array each call
  const pipeline: PipelineStage[] = [{ $project: buildProjection(fields) }];

  if (options?.nestedPipeline) {
    pipeline.push(...options.nestedPipeline);
  }

  return {
    $lookup: {
      as: asField,
      foreignField: '_id',
      from: 'ingredients',
      localField,
      pipeline: pipeline as LookupPipeline,
    },
  };
}

/**
 * Credential lookup with unwind
 * Returns [$lookup, $unwind] stages for populating a single credential
 *
 * @example
 * const pipeline = [
 *   { $match: { ... } },
 *   ...credentialLookup(),
 * ];
 */
export function credentialLookup(options?: LookupOptions): MultiPipelineStage {
  const fields = options?.fields ?? [...DEFAULT_FIELDS.credential];
  const localField = options?.localField ?? 'credential';
  const asField = options?.asField ?? 'credential';
  const preserveNull = options?.preserveNull ?? true;

  // Build fresh pipeline array each call
  const pipeline: PipelineStage[] = [{ $project: buildProjection(fields) }];

  if (options?.nestedPipeline) {
    pipeline.push(...options.nestedPipeline);
  }

  // Return fresh array each call to avoid race conditions
  return [
    {
      $lookup: {
        as: asField,
        foreignField: '_id',
        from: 'credentials',
        localField,
        pipeline: pipeline as LookupPipeline,
      },
    },
    {
      $unwind: {
        path: `$${asField}`,
        preserveNullAndEmptyArrays: preserveNull,
      },
    },
  ];
}

/**
 * Children posts lookup with optional nested ingredients and credentials
 * Returns a $lookup stage for populating children posts (thread replies)
 *
 * @example
 * const pipeline = [
 *   { $match: { ... } },
 *   childrenPostsLookup({
 *     statusFilter: [PostStatus.SCHEDULED, PostStatus.DRAFT],
 *     includeIngredients: true,
 *     includeCredential: true,
 *   }),
 * ];
 */
export function childrenPostsLookup(
  options?: ChildrenLookupOptions,
): SinglePipelineStage {
  const asField = options?.asField ?? 'children';

  // Build fresh nested pipeline array each call
  const nestedPipeline: PipelineStage[] = [];

  // Match filter for children
  const matchFilter: Record<string, unknown> = { isDeleted: false };
  if (options?.statusFilter && options.statusFilter.length > 0) {
    matchFilter.status = { $in: [...options.statusFilter] };
  }
  nestedPipeline.push({ $match: matchFilter });

  // Sort by order
  nestedPipeline.push({ $sort: { order: 1 } });

  // Optionally include ingredients lookup
  if (options?.includeIngredients) {
    nestedPipeline.push(ingredientsLookup());
  }

  // Optionally include credential lookup (spread since it returns array)
  if (options?.includeCredential) {
    nestedPipeline.push(...credentialLookup());
  }

  // Add any additional nested pipeline stages
  if (options?.nestedPipeline) {
    nestedPipeline.push(...options.nestedPipeline);
  }

  return {
    $lookup: {
      as: asField,
      foreignField: 'parent',
      from: 'posts',
      localField: '_id',
      pipeline: nestedPipeline as LookupPipeline,
    },
  };
}

/**
 * Metadata lookup with unwind
 * Returns [$lookup, $unwind] stages for populating metadata
 *
 * @example
 * const pipeline = [
 *   { $match: { ... } },
 *   ...metadataLookup(),
 * ];
 */
export function metadataLookup(options?: LookupOptions): MultiPipelineStage {
  const fields = options?.fields ?? [...DEFAULT_FIELDS.metadata];
  const localField = options?.localField ?? 'metadata';
  const asField = options?.asField ?? 'metadata';
  const preserveNull = options?.preserveNull ?? true;

  // Build fresh pipeline array each call
  const lookupPipeline: PipelineStage[] = [];

  if (fields.length > 0) {
    lookupPipeline.push({ $project: buildProjection(fields) });
  }

  if (options?.nestedPipeline) {
    lookupPipeline.push(...options.nestedPipeline);
  }

  // Return fresh array each call
  const lookupStage: LookupStage = {
    $lookup: {
      as: asField,
      foreignField: '_id',
      from: 'metadata',
      localField,
    },
  };

  const stages: MultiPipelineStage = [
    lookupPipeline.length > 0
      ? withLookupPipeline(lookupStage, lookupPipeline as LookupPipeline)
      : lookupStage,
    {
      $unwind: {
        path: `$${asField}`,
        preserveNullAndEmptyArrays: preserveNull,
      },
    },
  ];

  return stages;
}

/**
 * User lookup with unwind
 * Returns [$lookup, $unwind] stages for populating user
 */
export function userLookup(options?: LookupOptions): MultiPipelineStage {
  const fields = options?.fields ?? [...DEFAULT_FIELDS.user];
  const localField = options?.localField ?? 'user';
  const asField = options?.asField ?? 'user';
  const preserveNull = options?.preserveNull ?? true;

  const pipeline: PipelineStage[] = [{ $project: buildProjection(fields) }];

  if (options?.nestedPipeline) {
    pipeline.push(...options.nestedPipeline);
  }

  return [
    {
      $lookup: {
        as: asField,
        foreignField: '_id',
        from: 'users',
        localField,
        pipeline: pipeline as LookupPipeline,
      },
    },
    {
      $unwind: {
        path: `$${asField}`,
        preserveNullAndEmptyArrays: preserveNull,
      },
    },
  ];
}

/**
 * Brand lookup with unwind
 * Returns [$lookup, $unwind] stages for populating brand
 */
export function brandLookup(options?: LookupOptions): MultiPipelineStage {
  const fields = options?.fields ?? [...DEFAULT_FIELDS.brand];
  const localField = options?.localField ?? 'brand';
  const asField = options?.asField ?? 'brand';
  const preserveNull = options?.preserveNull ?? true;

  const pipeline: PipelineStage[] = [{ $project: buildProjection(fields) }];

  if (options?.nestedPipeline) {
    pipeline.push(...options.nestedPipeline);
  }

  return [
    {
      $lookup: {
        as: asField,
        foreignField: '_id',
        from: 'brands',
        localField,
        pipeline: pipeline as LookupPipeline,
      },
    },
    {
      $unwind: {
        path: `$${asField}`,
        preserveNullAndEmptyArrays: preserveNull,
      },
    },
  ];
}

/**
 * Organization lookup with unwind
 * Returns [$lookup, $unwind] stages for populating organization
 */
export function organizationLookup(
  options?: LookupOptions,
): MultiPipelineStage {
  const fields = options?.fields ?? [...DEFAULT_FIELDS.organization];
  const localField = options?.localField ?? 'organization';
  const asField = options?.asField ?? 'organization';
  const preserveNull = options?.preserveNull ?? true;

  const pipeline: PipelineStage[] = [{ $project: buildProjection(fields) }];

  if (options?.nestedPipeline) {
    pipeline.push(...options.nestedPipeline);
  }

  return [
    {
      $lookup: {
        as: asField,
        foreignField: '_id',
        from: 'organizations',
        localField,
        pipeline: pipeline as LookupPipeline,
      },
    },
    {
      $unwind: {
        path: `$${asField}`,
        preserveNullAndEmptyArrays: preserveNull,
      },
    },
  ];
}
