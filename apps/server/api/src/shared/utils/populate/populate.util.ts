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
 * Creates a relationInclude pipeline to resolve user data from the 'users' collection.
 * Use this instead of relation loading when the document lives in a different
 * database than the User record (e.g., CLOUD vs AUTH).
 *
 * All DB connections use the same Prisma datasource, so relationInclude works across
 * collection boundaries even though the models are split by database.
 */
export function createUserLookupPipeline(
  mode: 'minimal' | 'full' = 'minimal',
): PipelineStage[] {
  const projection =
    mode === 'minimal'
      ? { _id: 1, clerkId: 1, email: 1, firstName: 1, handle: 1, lastName: 1 }
      : {};

  return { where: {} };
}

/**
 * Creates MongoDB findAll query stages to lookup model labels
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
 * @returns Array of query fragments that enrich metadata with modelLabel
 */
export function createModelLookupPipeline() {
  return { where: {} };
}
