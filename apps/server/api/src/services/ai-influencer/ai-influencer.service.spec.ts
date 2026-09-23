import { AiInfluencerService } from '@api/services/ai-influencer/ai-influencer.service';
import { FileInputType, IngredientStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AiInfluencerService.createIngredientRecord', () => {
  const ingredientsService = { create: vi.fn(), patch: vi.fn() };
  const filesClientService = { uploadToS3: vi.fn() };
  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const persona = {
    brandId: 'brand-1',
    id: 'persona-1',
    organizationId: 'org-1',
    slug: 'mika',
    userId: 'user-1',
  };

  const service = new AiInfluencerService(
    {} as never,
    ingredientsService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    filesClientService as never,
    loggerService as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    ingredientsService.create.mockResolvedValue({ id: 'ing-1' });
    ingredientsService.patch.mockResolvedValue({
      id: 'ing-1',
      s3Key: 'ingredients/images/ing-1',
    });
    filesClientService.uploadToS3.mockResolvedValue({
      publicUrl: 'https://cdn.genfeed.ai/ingredients/images/ing-1',
      s3Key: 'ingredients/images/ing-1',
    });
  });

  it('copies the provider image into storage and stores only its key', async () => {
    const result = await service.createIngredientRecord(
      persona as never,
      'https://fal.media/files/x.png',
      'caption',
    );

    const created = ingredientsService.create.mock.calls[0]?.[0];
    expect(created).not.toHaveProperty('cdnUrl');
    expect(created.status).toBe(IngredientStatus.PROCESSING);
    expect(filesClientService.uploadToS3).toHaveBeenCalledWith(
      'ing-1',
      'images',
      { type: FileInputType.URL, url: 'https://fal.media/files/x.png' },
    );
    expect(ingredientsService.patch).toHaveBeenCalledWith('ing-1', {
      s3Key: 'ingredients/images/ing-1',
      status: IngredientStatus.GENERATED,
    });
    expect(result).toEqual({ id: 'ing-1', s3Key: 'ingredients/images/ing-1' });
  });

  it('fails loudly instead of keeping a temporary provider URL', async () => {
    filesClientService.uploadToS3.mockResolvedValue({ publicUrl: 'x' });

    await expect(
      service.createIngredientRecord(
        persona as never,
        'https://fal.media/files/x.png',
        'caption',
      ),
    ).rejects.toThrow(/no object key/);
    expect(ingredientsService.patch).toHaveBeenCalledTimes(1);
    expect(ingredientsService.patch).toHaveBeenCalledWith('ing-1', {
      status: IngredientStatus.FAILED,
    });
  });

  it('marks the ingredient failed when the upload itself rejects', async () => {
    filesClientService.uploadToS3.mockRejectedValue(new Error('files down'));

    await expect(
      service.createIngredientRecord(
        persona as never,
        'https://fal.media/files/x.png',
        'caption',
      ),
    ).rejects.toThrow('files down');
    expect(ingredientsService.patch).toHaveBeenCalledWith('ing-1', {
      status: IngredientStatus.FAILED,
    });
  });
});
