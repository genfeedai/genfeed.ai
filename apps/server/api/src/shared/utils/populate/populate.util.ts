import type { PopulateOption } from '@genfeedai/interfaces';

function createPopulate(path: string): PopulateOption {
  return { path };
}

function populateWithFields(
  path: string,
  fields: readonly string[],
): PopulateOption {
  return { path, select: fields };
}

function populateIdOnly(path: string): PopulateOption {
  return populateWithFields(path, ['id']);
}

/** Creates selective Prisma relation-loading options. */
export const PopulateBuilder = {
  create: createPopulate,
  idOnly: populateIdOnly,
  minimal: populateIdOnly,
  withFields: populateWithFields,
} as const;

/**
 * Common population patterns for different entities
 */
export const PopulatePatterns = {
  assetFull: PopulateBuilder.create('asset'),

  // Asset patterns
  assetMinimal: PopulateBuilder.withFields('asset', [
    'id',
    'category',
    'parentType',
    'parentOrgId',
    'parentBrandId',
    'parentIngredientId',
    'parentArticleId',
    'cloudObjectKey',
  ]),
  brandFull: PopulateBuilder.create('brand'),
  brandId: PopulateBuilder.idOnly('brand'),

  // Brand patterns
  brandMinimal: PopulateBuilder.withFields('brand', ['id', 'label', 'slug']),
  credentialFull: PopulateBuilder.create('credential'),

  // Credential patterns
  credentialMinimal: PopulateBuilder.withFields('credential', [
    'id',
    'platform',
    'externalHandle',
    'isConnected',
  ]),

  // Ingredient patterns
  ingredientMinimal: PopulateBuilder.withFields('ingredient', [
    'id',
    'category',
    'status',
  ]),
  ingredientsMinimal: PopulateBuilder.withFields('ingredients', [
    'id',
    'category',
    'status',
  ]),
  metadataBasic: PopulateBuilder.withFields('metadata', [
    'id',
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
    'id',
    'label',
  ]),
  parentMinimal: PopulateBuilder.withFields('parent', [
    'id',
    'category',
    'status',
  ]),
  postsFull: PopulateBuilder.create('posts'),

  // Post patterns
  postsMinimal: PopulateBuilder.withFields('posts', [
    'id',
    'platform',
    'status',
    'externalId',
    'scheduledDate',
    'publicationDate',
  ]),
  promptFull: PopulateBuilder.create('prompt'),

  // Prompt patterns
  promptMinimal: PopulateBuilder.withFields('prompt', [
    'id',
    'original',
    'enhanced',
  ]),
  userFull: PopulateBuilder.create('user'),
  userId: PopulateBuilder.idOnly('user'),
  // User patterns
  userMinimal: PopulateBuilder.withFields('user', [
    'id',
    'handle',
    'firstName',
    'lastName',
    'email',
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
