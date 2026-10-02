import type {
  ImageGenerationContext,
  ImageGenerationProviderResult,
  ImageGenerationSaveDocumentsResult,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import type { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import { persistImageProviderOutput } from '@api/collections/images/services/persist-image-provider-output.util';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';

type ImageProviderDocument = Pick<
  ImageGenerationSaveDocumentsResult,
  'ingredientData' | 'metadataData'
>;
export interface PrepareImageGenerationProviderDependencies {
  providerRegistry: Pick<ImageGenerationProviderRegistryService, 'prepare'>;
  metadataService: MetadataService;
  getBatchDocuments: (
    context: ImageGenerationContext,
  ) => ImageProviderDocument[] | undefined;
  getActiveDocument: (
    context: ImageGenerationContext,
  ) => ImageProviderDocument | undefined;
  beginSubmission: (
    context: ImageGenerationContext,
    ingredientIds: readonly string[],
  ) => void;
  patchExternalId: (
    metadataId: string,
    result: ImageGenerationProviderResult,
    context: ImageGenerationContext,
    ingredientId: string,
  ) => Promise<void>;
}
export async function prepareImageGenerationProvider(
  context: ImageGenerationContext,
  dependencies: PrepareImageGenerationProviderDependencies,
  apiKeyOverride?: string,
): Promise<PreparedImageGenerationProvider | null> {
  return dependencies.providerRegistry.prepare({
    abortSignal: context.abortSignal,
    apiKeyOverride: apiKeyOverride,
    brandPromptBranding: context.brandPromptBranding,
    compiledDispatch: context.compiledDispatch,
    createImageDto: context.createImageDto,
    height: context.height,
    model: context.model,
    modelEndpoint: context.modelEndpoint,
    modelInputSchema: context.modelInputSchema,
    modelProvider: context.modelProvider,
    modelSchemaFamily: context.modelSchemaFamily,
    onProviderSubmissionStarted: () => {
      const documents = dependencies.getBatchDocuments(context);
      const target = dependencies.getActiveDocument(context);
      dependencies.beginSubmission(
        context,
        documents
          ? documents.map(({ ingredientData }) => ingredientData.id)
          : [target?.ingredientData.id ?? context.ingredientData.id],
      );
    },
    onProviderOutput: async (output) => {
      const target = dependencies.getActiveDocument(context) ?? {
        metadataData: context.metadataData,
      };
      await persistImageProviderOutput(
        dependencies.metadataService,
        target.metadataData.id,
        output,
        dependencies.getBatchDocuments(context)?.length ?? 1,
      );
    },
    onExternalJobCreated: async (externalId) => {
      const documents = dependencies.getBatchDocuments(context);
      if (documents) {
        await Promise.all(
          documents.map(({ ingredientData, metadataData }, index) =>
            dependencies.patchExternalId(
              metadataData.id,
              { kind: 'external-id', externalId: `${externalId}_${index}` },
              context,
              ingredientData.id,
            ),
          ),
        );
      } else {
        const target = dependencies.getActiveDocument(context) ?? {
          ingredientData: context.ingredientData,
          metadataData: context.metadataData,
        };
        await dependencies.patchExternalId(
          target.metadataData.id,
          { kind: 'external-id', externalId },
          context,
          target.ingredientData.id,
        );
      }
    },
    organizationId: context.user.organizationId,
    outputs: context.outputs,
    prompt:
      context.generationHarness?.enhancedPrompt ?? context.promptData.original,
    providerInput: context.providerInput,
    promptBuilderBrand: context.promptBuilderBrand,
    promptId: context.promptData.id,
    referenceImageUrl: context.referenceImageUrl,
    referenceImageUrls: context.referenceImageUrls,
    style: context.style,
    width: context.width,
  });
}
