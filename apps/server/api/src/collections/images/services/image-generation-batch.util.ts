import type {
  ImageGenerationContext,
  ImageGenerationProviderResult,
  ImageGenerationSaveDocumentsResult,
} from '@api/collections/images/services/image-generation.types';
import type { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientStatus } from '@genfeedai/contracts';

/**
 * Gathers every batch output document, reusing the editing preallocation and
 * creating plus admitting the rest, so each output is funded before submit.
 */
export async function allocateBatchDocuments(
  context: ImageGenerationContext,
  preallocated: ImageGenerationSaveDocumentsResult[] | undefined,
  createAdditional: (
    context: ImageGenerationContext,
  ) => Promise<ImageGenerationSaveDocumentsResult>,
  admit: (
    context: ImageGenerationContext,
    ingredientId: ImageGenerationSaveDocumentsResult['ingredientData']['id'],
  ) => Promise<void>,
  onDocument: (document: ImageGenerationSaveDocumentsResult) => void,
): Promise<ImageGenerationSaveDocumentsResult[]> {
  const additionalDocuments: ImageGenerationSaveDocumentsResult[] = [];
  if (preallocated) {
    for (const output of preallocated.slice(1)) {
      additionalDocuments.push(output);
      onDocument(output);
    }
  }
  for (
    let index = preallocated ? context.outputs : 1;
    index < context.outputs;
    index += 1
  ) {
    const output = await createAdditional(context);
    additionalDocuments.push(output);
    onDocument(output);
    await admit(context, output.ingredientData.id);
  }
  return additionalDocuments;
}

export function requireExternalId(
  result: ImageGenerationProviderResult,
): string {
  if (result.kind !== 'external-id' || !result.externalId) {
    throw new Error('Image provider returned no external ID');
  }
  return result.externalId;
}

/** Claims a still-processing output the provider never produced and fails it. */
export async function failUnproducedBatchOutput(
  imagesService: ImagesService,
  context: ImageGenerationContext,
  ingredientId: string,
): Promise<boolean> {
  const claimed = await imagesService.patchAll(
    {
      id: ingredientId,
      organizationId: context.user.organizationId,
      isDeleted: false,
      status: IngredientStatus.PROCESSING,
    },
    {
      status: IngredientStatus.FAILED,
      generationError:
        'Provider completed without producing this requested output',
      isGenerationFailureConfirmed: true,
    },
  );
  return claimed.modifiedCount === 1;
}
