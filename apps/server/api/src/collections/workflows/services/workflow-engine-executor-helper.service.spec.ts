import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { ReplicateProviderError } from '@api/services/integrations/replicate/errors/replicate-provider.error';
import {
  AgentFailureReason,
  IngredientCategory,
  MetadataExtension,
} from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import type { ConfigService } from '@libs/config/config.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowEngineExecutorHelperService.resolveBrandIdFromInputOrFail', () => {
  const sourceIngredientId = testId('ingredient');
  const organizationId = 'org-1';

  const findOne = vi.fn();
  const ingredientsService = { findOne } as unknown as IngredientsService;
  const configService = {} as unknown as ConfigService;

  let service: WorkflowEngineExecutorHelperService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WorkflowEngineExecutorHelperService(
      configService,
      undefined,
      undefined,
      ingredientsService,
    );
  });

  it('returns the configured brandId without touching the ingredient store', async () => {
    const brandId = await service.resolveBrandIdFromInputOrFail(
      'brand-from-config',
      { id: sourceIngredientId },
      'lipSync',
      organizationId,
    );

    expect(brandId).toBe('brand-from-config');
    expect(findOne).not.toHaveBeenCalled();
  });

  it('resolves the brandId from the source ingredient scalar FK', async () => {
    findOne.mockResolvedValue({
      brandId: 'brand-from-ingredient',
      id: sourceIngredientId,
    });

    const brandId = await service.resolveBrandIdFromInputOrFail(
      undefined,
      { id: sourceIngredientId },
      'reframe',
      organizationId,
    );

    expect(brandId).toBe('brand-from-ingredient');
    expect(findOne).toHaveBeenCalledWith({
      id: sourceIngredientId,
      isDeleted: false,
      organizationId,
    });
  });

  it('throws when neither a configured brandId nor a source ingredient brand exists', async () => {
    findOne.mockResolvedValue({ brandId: null, id: sourceIngredientId });

    await expect(
      service.resolveBrandIdFromInputOrFail(
        undefined,
        { id: sourceIngredientId },
        'upscale',
        organizationId,
      ),
    ).rejects.toThrow('upscale requires a brandId or source ingredient brand');
  });

  it('does not resolve a brandId from an ingredient in another organization', async () => {
    // Org-scoped query misses the foreign-org ingredient → returns null.
    findOne.mockResolvedValue(null);

    await expect(
      service.resolveBrandIdFromInputOrFail(
        undefined,
        { id: sourceIngredientId },
        'lipSync',
        organizationId,
      ),
    ).rejects.toThrow('lipSync requires a brandId or source ingredient brand');

    expect(findOne).toHaveBeenCalledWith({
      id: sourceIngredientId,
      isDeleted: false,
      organizationId,
    });
  });
});

describe('WorkflowEngineExecutorHelperService.createWorkflowOutputIngredient', () => {
  it('forwards canonical generation provenance to media persistence', async () => {
    const createMediaDocumentsInternal = vi.fn().mockResolvedValue({
      ingredientData: { id: 'ingredient-1' },
      metadataData: { id: 'metadata-1' },
    });
    const service = new WorkflowEngineExecutorHelperService(
      {} as ConfigService,
      { createMediaDocumentsInternal } as never,
      { patch: vi.fn() } as never,
      { patch: vi.fn() } as never,
    );

    await service.createWorkflowOutputIngredient({
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      extension: MetadataExtension.JPG,
      generationPrompt: 'A launch poster',
      generationSource: 'generation-brief:v1:workflow',
      model: 'qwen-image',
      negativePrompt: 'watermark',
      organizationId: 'org-1',
      providerData: { compilerId: 'qwen-image-image-compiler' },
      userId: 'user-1',
    });

    expect(createMediaDocumentsInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        generationPrompt: 'A launch poster',
        generationSource: 'generation-brief:v1:workflow',
        negativePrompt: 'watermark',
        providerData: { compilerId: 'qwen-image-image-compiler' },
      }),
    );
  });
});

describe('WorkflowEngineExecutorHelperService.createAndLinkProcessingOutput', () => {
  it('marks the inspectable output failed when provider dispatch rejects', async () => {
    const failProviderSubmission = vi.fn().mockResolvedValue(undefined);
    const service = new WorkflowEngineExecutorHelperService(
      {} as ConfigService,
      {
        createMediaDocumentsInternal: vi.fn().mockResolvedValue({
          ingredientData: { id: 'ingredient-1' },
          metadataData: { id: 'metadata-1' },
        }),
      } as never,
      { patch: vi.fn() } as never,
      { patch: vi.fn() } as never,
      {
        createBeforeProviderSubmission: vi
          .fn()
          .mockResolvedValue({ continuationId: 'continuation-1' }),
        failProviderSubmission,
      } as never,
    );
    const providerError = new ReplicateProviderError(
      AgentFailureReason.INSUFFICIENT_CREDITS,
      'provider rejected the request',
      { statusCode: 402, isRetryable: false },
    );

    await expect(
      service.createAndLinkProcessingOutput({
        continuation: {
          actionId: 'videoGen',
          context: {
            executionId: 'execution-1',
            organizationId: 'org-1',
            runId: 'run-1',
            userId: 'user-1',
            workflowId: 'workflow-1',
            workflowVersionId: 'version-1',
          },
          node: {
            config: {},
            id: 'generate',
            inputs: [],
            label: 'Generate',
            type: 'videoGen',
          },
          provider: 'replicate',
        },
        output: {
          brandId: 'brand-1',
          category: IngredientCategory.VIDEO,
          extension: MetadataExtension.MP4,
          organizationId: 'org-1',
          userId: 'user-1',
        },
        resultUrl: (ingredientId) => `/videos/${ingredientId}`,
        runProvider: vi.fn().mockRejectedValue(providerError),
      }),
    ).rejects.toBe(providerError);

    expect(failProviderSubmission).toHaveBeenCalledWith({
      continuationId: 'continuation-1',
      error: 'provider rejected the request',
      organizationId: 'org-1',
    });
  });
  it.each(['ambiguous submission', 'accepted identity persistence'])(
    'preserves provider intent when %s fails',
    async (failurePoint) => {
      const error = new Error(failurePoint);
      const failProviderSubmission = vi.fn();
      const markProviderSubmitted = vi.fn().mockRejectedValue(error);
      const runProvider =
        failurePoint === 'ambiguous submission'
          ? vi.fn().mockRejectedValue(error)
          : vi.fn().mockResolvedValue('accepted-job');
      const service = new WorkflowEngineExecutorHelperService(
        {} as ConfigService,
        {
          createMediaDocumentsInternal: vi.fn().mockResolvedValue({
            ingredientData: { id: 'ingredient-1' },
            metadataData: { id: 'metadata-1' },
          }),
        } as never,
        { patch: vi.fn() } as never,
        { patch: vi.fn() } as never,
        {
          createBeforeProviderSubmission: vi
            .fn()
            .mockResolvedValue({ continuationId: 'continuation-1' }),
          failProviderSubmission,
          markProviderSubmitted,
        } as never,
      );
      await expect(
        service.createAndLinkProcessingOutput({
          continuation: {
            actionId: 'videoGen',
            context: {
              executionId: 'execution-1',
              organizationId: 'org-1',
              runId: 'run-1',
              userId: 'user-1',
              workflowId: 'workflow-1',
              workflowVersionId: 'version-1',
            },
            node: {
              config: {},
              id: 'generate',
              inputs: [],
              label: 'Generate',
              type: 'videoGen',
            },
            provider: 'replicate',
          },
          output: {
            brandId: 'brand-1',
            category: IngredientCategory.VIDEO,
            extension: MetadataExtension.MP4,
            organizationId: 'org-1',
            userId: 'user-1',
          },
          resultUrl: (id) => `/videos/${id}`,
          runProvider,
        }),
      ).rejects.toBe(error);
      expect(failProviderSubmission).not.toHaveBeenCalled();
      if (failurePoint === 'accepted identity persistence') {
        expect(markProviderSubmitted).toHaveBeenCalledExactlyOnceWith({
          continuationId: 'continuation-1',
          externalId: 'accepted-job',
          organizationId: 'org-1',
        });
      } else expect(markProviderSubmitted).not.toHaveBeenCalled();
    },
  );

  it('records the BYOK credential reference on the provider continuation', async () => {
    const createBeforeProviderSubmission = vi
      .fn()
      .mockResolvedValue({ continuationId: 'continuation-1' });
    const service = new WorkflowEngineExecutorHelperService(
      {} as ConfigService,
      {
        createMediaDocumentsInternal: vi.fn().mockResolvedValue({
          ingredientData: { id: 'ingredient-1' },
          metadataData: { id: 'metadata-1' },
        }),
      } as never,
      { patch: vi.fn().mockResolvedValue(undefined) } as never,
      { patch: vi.fn().mockResolvedValue(undefined) } as never,
      {
        createBeforeProviderSubmission,
        markProviderSubmitted: vi.fn().mockResolvedValue(undefined),
      } as never,
    );

    await service.createAndLinkProcessingOutput({
      continuation: {
        actionId: 'videoGen',
        context: {
          executionId: 'execution-1',
          organizationId: 'org-1',
          runId: 'run-1',
          userId: 'user-1',
          workflowId: 'workflow-1',
          workflowVersionId: 'version-1',
        },
        isByok: true,
        node: {
          config: {},
          id: 'generate',
          inputs: [],
          label: 'Generate',
          type: 'videoGen',
        },
        provider: 'replicate',
      },
      output: {
        brandId: 'brand-1',
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        organizationId: 'org-1',
        userId: 'user-1',
      },
      resultUrl: (ingredientId) => `/videos/${ingredientId}`,
      runProvider: vi.fn().mockResolvedValue('prediction-1'),
    });

    expect(createBeforeProviderSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ isByok: true }),
    );
  });
});

describe('WorkflowEngineExecutorHelperService.requireMediaAsset activated storage', () => {
  it('returns the exact raw stored key from a scoped ready record, including reserved characters', async () => {
    const key = 'ingredients/videos/random key?frame=#x%2F.mp4';
    const findOne = vi
      .fn()
      .mockResolvedValue({
        id: 'asset-1',
        brandId: 'brand-1',
        category: IngredientCategory.VIDEO,
        status: 'GENERATED',
        s3Key: key,
      });
    const helper = new WorkflowEngineExecutorHelperService(
      { isAuthorizedMediaDeliveryEnabled: true } as ConfigService,
      undefined,
      undefined,
      { findOne } as unknown as IngredientsService,
    );
    const asset = await helper.requireMediaAsset('asset-1', 'org-1', [
      IngredientCategory.VIDEO,
    ]);
    expect(asset.objectKey).toBe(key);
    expect(findOne).toHaveBeenCalledWith({
      id: 'asset-1',
      organizationId: 'org-1',
      isDeleted: false,
    });
  });

  it('rejects a keyless record when activated instead of rebuilding an object key from its ID', async () => {
    const findOne = vi
      .fn()
      .mockResolvedValue({
        id: 'asset-1',
        brandId: 'brand-1',
        category: IngredientCategory.VIDEO,
        status: 'GENERATED',
        s3Key: null,
      });
    const helper = new WorkflowEngineExecutorHelperService(
      { isAuthorizedMediaDeliveryEnabled: true } as ConfigService,
      undefined,
      undefined,
      { findOne } as unknown as IngredientsService,
    );
    await expect(
      helper.requireMediaAsset('asset-1', 'org-1', [IngredientCategory.VIDEO]),
    ).rejects.toThrow('no trusted stored object key');
  });
});
