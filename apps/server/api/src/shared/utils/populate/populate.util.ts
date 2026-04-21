import type { PopulateOption } from '@genfeedai/interfaces';

type PipelineStage = Record<string, unknown>;

/**
 * Creates selective populate options for MongoDB queries
 * Allows specifying which fields to include from populated references
 */
export class PopulateBuilder {
  static create(path: string): PopulateOption {
    return { path };
  }

  static withFields(path: string, fields: string[]): PopulateOption {
    return {
      path,
      select: fields.join(' '),
    };
  }

  static idOnly(path: string): PopulateOption {
    return {
      path,
      select: '_id',
    };
  }

  static minimal(path: string): PopulateOption {
    // Common minimal fields that are often needed
    return {
      path,
      select: '_id label handle',
    };
  }
}

/**
 * Common population patterns for different entities
 */
export const PopulatePatterns = {
  assetFull: PopulateBuilder.create('asset'),

  // Asset patterns
  assetMinimal: PopulateBuilder.withFields('asset', [
    '_id',
    'category',
    'parent',
    'parentModel',
  ]),
  brandFull: PopulateBuilder.create('brand'),
  brandId: PopulateBuilder.idOnly('brand'),

  // Brand patterns
  brandMinimal: PopulateBuilder.minimal('brand'), // Uses _id label handle which matches brand schema
  credentialFull: PopulateBuilder.create('credential'),

  // Credential patterns
  credentialMinimal: PopulateBuilder.withFields('credential', [
    '_id',
    'platform',
    'externalHandle',
    'isConnected',
  ]),

  // Ingredient patterns
  ingredientMinimal: PopulateBuilder.withFields('ingredient', [
    '_id',
    'category',
    'status',
  ]),
  ingredientsMinimal: PopulateBuilder.withFields('ingredients', [
    '_id',
    'category',
    'status',
  ]),
  metadataBasic: PopulateBuilder.withFields('metadata', [
    '_id',
    'width',
    'height',
    'duration',
    'size',
    'extension',
    'model',
    'style',
  ]),

  // Metadata patterns
  metadataFull: PopulateBuilder.create('metadata'),
  organizationFull: PopulateBuilder.create('organization'),
  organizationId: PopulateBuilder.idOnly('organization'),

  // Organization patterns
  organizationMinimal: PopulateBuilder.withFields('organization', [
    '_id',
    'label',
  ]),
  parentMinimal: PopulateBuilder.withFields('parent', [
    '_id',
    'category',
    'status',
  ]),
  postsFull: PopulateBuilder.create('posts'),

  // Post patterns
  postsMinimal: PopulateBuilder.withFields('posts', [
    '_id',
    'platform',
    'status',
    'externalId',
    'scheduledDate',
    'publicationDate',
  ]),
  promptFull: PopulateBuilder.create('prompt'),

  // Prompt patterns
  promptMinimal: PopulateBuilder.withFields('prompt', [
    '_id',
    'original',
    'enhanced',
  ]),
  userFull: PopulateBuilder.create('user'),
  userId: PopulateBuilder.idOnly('user'),
  // User patterns
  userMinimal: PopulateBuilder.withFields('user', [
    '_id',
    'handle',
    'firstName',
    'lastName',
    'email',
    'clerkId',
  ]),
};

/**
 * Get population options based on the requested detail level
 */
export function getPopulationLevel(
  entity: string,
  level: 'id' | 'minimal' | 'full' = 'minimal',
): PopulateOption {
  switch (level) {
    case 'id':
      return PopulateBuilder.idOnly(entity);
    case 'minimal':
      return PopulateBuilder.minimal(entity);
    case 'full':
      return PopulateBuilder.create(entity);
    default:
      return PopulateBuilder.minimal(entity);
  }
}

/**
 * Creates a $lookup pipeline to resolve user data from the 'users' collection.
 * Use this instead of relation loading when the document lives in a different
 * database than the User record (e.g., CLOUD vs AUTH).
 *
 * All DB connections use the same MongoDB URL, so $lookup works across
 * collection boundaries even though the models are split by database.
 */
export function createUserLookupPipeline(
  mode: 'minimal' | 'full' = 'minimal',
): PipelineStage[] {
  const projection =
    mode === 'minimal'
      ? { _id: 1, clerkId: 1, email: 1, firstName: 1, handle: 1, lastName: 1 }
      : {};

  return [
    {
      $lookup: {
        as: '_userDoc',
        foreignField: '_id',
        from: 'users',
        localField: 'user',
        ...(mode === 'minimal' ? { pipeline: [{ $project: projection }] } : {}),
      },
    },
    {
      $addFields: {
        user: { $ifNull: [{ $arrayElemAt: ['$_userDoc', 0] }, '$user'] },
      },
    },
    { $unset: ['_userDoc'] },
  ];
}

/**
 * Creates MongoDB aggregation pipeline stages to lookup model labels
 * Supports both regular models (from models collection) and training models (from trainings collection)
 *
 * IMPORTANT: This pipeline must first lookup/populate metadata before accessing its fields.
 * The metadata field in ingredients is an ObjectId reference, not an embedded document.
 *
 * The pipeline:
 * 1. Looks up the metadata document
 * 2. Looks up model label from models or trainings collections
 * 3. Replaces metadata ObjectId with the full document INCLUDING modelLabel
 * 4. Adds modelLabel at root level for serializer/UI consumption
 *
 * @returns Array of pipeline stages that enrich metadata with modelLabel
 */
export function createModelLookupPipeline() {
  return [
    // First, lookup the metadata document to access its fields
    {
      $lookup: {
        as: '_metadataDoc',
        foreignField: '_id',
        from: 'metadata',
        localField: 'metadata',
      },
    },

    // Extract the model key from the looked-up metadata document
    {
      $addFields: {
        _modelKey: { $arrayElemAt: ['$_metadataDoc.model', 0] },
      },
    },

    // Lookup regular models from models collection by key
    {
      $lookup: {
        as: '_modelData',
        foreignField: 'key',
        from: 'models',
        localField: '_modelKey',
        pipeline: [
          {
            $project: {
              _id: 1,
              key: 1,
              label: 1,
            },
          },
        ],
      },
    },

    // Lookup training models from trainings collection by model field
    // Training models have model keys like "GENFEEDAI/68B5E9F5BEDB217937B843AB:VERSION_HASH"
    // The training.model field stores the Replicate trained model URL/version
    {
      $lookup: {
        as: '_trainingData',
        from: 'trainings',
        let: { modelKey: '$_modelKey' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$model', '$$modelKey'] },
                  { $eq: ['$isDeleted', false] },
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
              label: 1,
              model: 1,
            },
          },
        ],
      },
    },

    // Compute the resolved model label
    {
      $addFields: {
        _resolvedModelLabel: {
          $cond: {
            else: {
              $cond: {
                // Fallback to null if not found (keep original model key via metadata.model)
                else: null,
                if: { $gt: [{ $size: '$_trainingData' }, 0] },
                // If found in trainings collection, use its label
                then: { $arrayElemAt: ['$_trainingData.label', 0] },
              },
            },
            if: { $gt: [{ $size: '$_modelData' }, 0] },
            // If found in models collection, use its label
            then: { $arrayElemAt: ['$_modelData.label', 0] },
          },
        },
      },
    },

    // Replace metadata ObjectId with populated document INCLUDING modelLabel
    // This ensures serializers can access metadata.modelLabel
    {
      $addFields: {
        metadata: {
          $cond: {
            // If no metadata doc found, keep original (ObjectId or null)
            else: '$metadata',
            if: { $gt: [{ $size: '$_metadataDoc' }, 0] },
            then: {
              $mergeObjects: [
                { $arrayElemAt: ['$_metadataDoc', 0] },
                { modelLabel: '$_resolvedModelLabel' },
              ],
            },
          },
        },
        // Also add at root level for serializer/UI consumption
        modelLabel: '$_resolvedModelLabel',
      },
    },

    // Clean up temporary lookup fields
    {
      $unset: [
        '_modelData',
        '_trainingData',
        '_metadataDoc',
        '_modelKey',
        '_resolvedModelLabel',
      ],
    },
  ];
}
