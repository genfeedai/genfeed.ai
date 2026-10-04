import { describe, expect, it } from 'vitest';
import { FLUX_3_EDIT_CONTRACT_VERSION } from './flux-3-image.constant';
import { readImageEditingRecipe } from './image-edit-models.constant';
import { UNIFIED_MODEL_CATALOG } from './model-catalog.constant';
import { MODEL_KEYS } from './model-keys.constant';

describe('FLUX.3 catalog and recipes', () => {
  it('registers generation and editing on distinct registry endpoints without changing defaults', () => {
    const keys = [
      MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE,
      MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT,
    ];
    const rows = UNIFIED_MODEL_CATALOG.filter((row) =>
      keys.some((key) => key === row.key),
    );
    expect(rows).toHaveLength(2);
    for (const row of rows)
      expect(row).toMatchObject({
        isActive: true,
        isPublic: true,
        isDefault: false,
        maxOutputs: 1,
        maxReferences: 10,
        isBatchSupported: false,
      });
    for (const row of rows) expect(row.endpoint).toBe(row.key);
    expect(
      UNIFIED_MODEL_CATALOG.find(
        (row) => row.key === MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5,
      )?.isDefault,
    ).toBe(true);
  });
  const recipe = {
    operation: 'image-edit',
    contractVersion: FLUX_3_EDIT_CONTRACT_VERSION,
    model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT,
    sourceIds: ['source'],
    outputs: 1,
    resolution: '1.5k',
    aspectRatio: 'auto',
    grounding: false,
  };
  it('allowlists the exact native recipe', () =>
    expect(readImageEditingRecipe({ ...recipe, privateKey: 'secret' })).toEqual(
      recipe,
    ));
  it.each([
    { seed: 0 },
    { maskId: 'mask' },
    { size: 'source' },
    { quality: 'medium' },
    { outputs: 2 },
    { resolution: '2K' },
    { grounding: true },
  ])('rejects incompatible recipe fields %j', (patch) =>
    expect(readImageEditingRecipe({ ...recipe, ...patch })).toBeUndefined(),
  );
});
