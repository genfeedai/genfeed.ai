import type { Prisma } from '@genfeedai/prisma';

/**
 * The ingredient columns the activity feed serializes (`ingredientAttributes`)
 * or reads to reconcile a generation. Listing them keeps the heavy JSON
 * columns (`mediaProbe`, `providerData`, `generationBilling`,
 * `generationProvider`, `mergeSettings`) out of every `/activities` page.
 */
const GENERATION_INGREDIENT_COLUMNS = {
  agentStrategyId: true,
  brandId: true,
  category: true,
  createdAt: true,
  fileSize: true,
  folderId: true,
  generationCompletedAt: true,
  generationError: true,
  generationHarness: true,
  generationProgress: true,
  generationPrompt: true,
  generationStage: true,
  id: true,
  isDefault: true,
  isDeleted: true,
  isFavorite: true,
  isHighlighted: true,
  metadataId: true,
  mimeType: true,
  modelUsed: true,
  order: true,
  organizationId: true,
  origin: true,
  parentId: true,
  promptId: true,
  promptTemplate: true,
  qualityStatus: true,
  reviewStatus: true,
  s3Key: true,
  scope: true,
  status: true,
  templateVersion: true,
  trainingId: true,
  transformations: true,
  updatedAt: true,
  userId: true,
  version: true,
  workflowExecutionId: true,
} satisfies Prisma.IngredientSelect;

export const GENERATION_INGREDIENT_SELECT = {
  ...GENERATION_INGREDIENT_COLUMNS,
  cdnUrl: true,
  metadata: {
    select: {
      createdAt: true,
      description: true,
      duration: true,
      error: true,
      extension: true,
      externalId: true,
      fps: true,
      hasAudio: true,
      height: true,
      id: true,
      isDeleted: true,
      label: true,
      model: true,
      resolution: true,
      result: true,
      size: true,
      style: true,
      updatedAt: true,
      width: true,
    },
  },
} satisfies Prisma.IngredientSelect & { cdnUrl?: boolean }; // cdnUrl is a Prisma result extension

export type GenerationIngredient = Prisma.IngredientGetPayload<{
  select: typeof GENERATION_INGREDIENT_COLUMNS & {
    metadata: typeof GENERATION_INGREDIENT_SELECT.metadata;
  };
}>;
