import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import {
  IngredientCategory,
  IngredientStatus,
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
    const providerError = new Error('provider rejected the request');

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
});
