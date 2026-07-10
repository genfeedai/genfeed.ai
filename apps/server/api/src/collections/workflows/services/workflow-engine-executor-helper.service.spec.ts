import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import type { ConfigService } from '@libs/config/config.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkflowEngineExecutorHelperService.resolveBrandIdFromInputOrFail', () => {
  const sourceIngredientId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
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
      _id: sourceIngredientId,
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
      _id: sourceIngredientId,
      isDeleted: false,
      organizationId,
    });
  });
});
