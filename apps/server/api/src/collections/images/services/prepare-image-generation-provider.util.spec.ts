import type {
  ImageGenerationContext,
  ImageGenerationProviderRequest,
} from '@api/collections/images/services/image-generation.types';
import { prepareImageGenerationProvider } from '@api/collections/images/services/prepare-image-generation-provider.util';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';

describe('prepareImageGenerationProvider', () => {
  function setup(activeMetadataId?: string) {
    const patches: Array<{ id: string; externalId?: string }> = [];
    const metadataService = {
      patch: async (id: string, entity: { externalId?: string }) => {
        patches.push({ externalId: entity.externalId, id });
      },
    } as unknown as MetadataService;
    let request: ImageGenerationProviderRequest | undefined;
    const context = {
      createImageDto: {},
      ingredientData: { id: 'ingredient-1' },
      metadataData: { id: 'metadata-1' },
      promptData: { id: 'prompt-1', original: 'a cat' },
      referenceImageUrls: [],
      user: { organizationId: 'org-1' },
    } as unknown as ImageGenerationContext;
    const prepared = prepareImageGenerationProvider(context, {
      beginSubmission: () => undefined,
      getActiveDocument: () =>
        activeMetadataId
          ? ({
              ingredientData: { id: 'ingredient-2' },
              metadataData: { id: activeMetadataId },
            } as never)
          : undefined,
      getBatchDocuments: () => undefined,
      metadataService,
      patchExternalId: async () => undefined,
      providerRegistry: {
        prepare: async (input) => {
          request = input;
          return null;
        },
      },
    });
    return { patches, prepared, request: () => request };
  }

  it('stores a queued job reference on the placeholder without marking the output accepted', async () => {
    const { patches, prepared, request } = setup();
    await prepared;

    await request()?.onProviderJobQueued?.('fal-request:fal-ai/flux:req-1');

    expect(patches).toEqual([
      { externalId: 'fal-request:fal-ai/flux:req-1', id: 'metadata-1' },
    ]);
  });

  it('stores it on the output being generated when outputs run one by one', async () => {
    const { patches, prepared, request } = setup('metadata-2');
    await prepared;

    await request()?.onProviderJobQueued?.('fal-request:fal-ai/flux:req-2');

    expect(patches).toEqual([
      { externalId: 'fal-request:fal-ai/flux:req-2', id: 'metadata-2' },
    ]);
  });
});
