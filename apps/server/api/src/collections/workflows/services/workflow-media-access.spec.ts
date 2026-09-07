import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/index', () => ({ scopedWhere: vi.fn() }));
vi.mock('@api/collections/ingredients/services/ingredients.service', () => ({
  IngredientsService: class {},
}));
vi.mock('@api/collections/metadata/services/metadata.service', () => ({
  MetadataService: class {},
}));
vi.mock('@api/shared/services/shared/shared.service', () => ({
  SharedService: class {},
}));
vi.mock(
  '@api/collections/workflows/services/workflow-node-continuation.service',
  () => ({ WorkflowNodeContinuationService: class {} }),
);

import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';

type Args = ConstructorParameters<typeof WorkflowEngineExecutorHelperService>;
function setup(asset: unknown) {
  const findOne = vi.fn().mockResolvedValue(asset);
  const helper = new WorkflowEngineExecutorHelperService(
    {} as Args[0],
    undefined,
    undefined,
    { findOne } as unknown as Args[3],
  );
  return { helper, findOne };
}
describe('Workflow Library media access', () => {
  it('uses tenant, deletion, readiness and stored object identity for a localized audio artifact', async () => {
    const { helper, findOne } = setup({
      id: 'audio-id',
      brandId: 'brand-1',
      category: IngredientCategory.AUDIO,
      status: IngredientStatus.GENERATED,
      s3Key: 'ingredients/audios/audio-id.wav',
    });
    const result = await helper.requireMediaAsset(
      { id: 'audio-id', audioUrl: 'https://untrusted.test/ignored.wav' },
      'org-1',
      [IngredientCategory.AUDIO],
    );
    expect(findOne).toHaveBeenCalledWith({
      id: 'audio-id',
      organizationId: 'org-1',
      isDeleted: false,
    });
    expect(result).toMatchObject({
      storageType: 'audios',
      storageKey: 'audio-id.wav',
    });
  });
  it.each([
    IngredientStatus.UPLOADED,
    IngredientStatus.VALIDATED,
    IngredientStatus.DRAFT,
  ])('accepts stored Library media in %s status', async (status) => {
    const { helper } = setup({
      id: 'video',
      brandId: 'brand',
      category: IngredientCategory.VIDEO,
      status,
      s3Key: 'ingredients/videos/video.mp4',
    });
    await expect(
      helper.requireMediaAsset({ id: 'video' }, 'org', [
        IngredientCategory.VIDEO,
      ]),
    ).resolves.toMatchObject({ id: 'video', storageKey: 'video.mp4' });
  });
  it('rejects an empty draft that has no stored media', async () => {
    const { helper } = setup({
      id: 'video',
      brandId: 'brand',
      category: IngredientCategory.VIDEO,
      status: IngredientStatus.DRAFT,
    });
    await expect(
      helper.requireMediaAsset({ id: 'video' }, 'org', [
        IngredientCategory.VIDEO,
      ]),
    ).rejects.toThrow('unavailable');
  });
  it.each([
    null,
    {
      brandId: 'brand-1',
      category: IngredientCategory.AUDIO,
      status: IngredientStatus.PROCESSING,
    },
    {
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      status: IngredientStatus.GENERATED,
    },
  ])('rejects missing, unfinished or wrong-category assets', async (asset) => {
    const { helper } = setup(asset);
    await expect(
      helper.requireMediaAsset({ id: 'asset' }, 'org-1', [
        IngredientCategory.AUDIO,
      ]),
    ).rejects.toThrow('unavailable');
  });
  it('does not fetch arbitrary external media URLs', async () => {
    const { helper, findOne } = setup(null);
    await expect(
      helper.requireMediaAsset('https://external.test/file.mp4', 'org-1', [
        IngredientCategory.VIDEO,
      ]),
    ).rejects.toThrow('Library');
    expect(findOne).not.toHaveBeenCalled();
  });
});
