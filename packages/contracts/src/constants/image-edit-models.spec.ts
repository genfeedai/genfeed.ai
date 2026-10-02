import { describe, expect, it } from 'vitest';
import { ModelCategory } from '..';
import {
  IMAGE_EDIT_CONTRACT_VERSION,
  readImageEditingRecipe,
} from './image-edit-models.constant';
import { UNIFIED_MODEL_CATALOG } from './model-catalog.constant';
import { MODEL_KEYS } from './model-keys.constant';

const model = MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5;
describe('dedicated image editing contract', () => {
  it('seeds a priced category default independently of image generation', () => {
    expect(
      UNIFIED_MODEL_CATALOG.find((row) => row.key === model),
    ).toMatchObject({
      category: ModelCategory.IMAGE_EDIT,
      isDefault: true,
      providerCostUsd: 0.06,
    });
    expect(
      UNIFIED_MODEL_CATALOG.find(
        (row) => row.category === ModelCategory.IMAGE && row.isDefault,
      )?.key,
    ).not.toBe(model);
  });
  it('allows only public recipe fields and rejects unsupported contracts', () => {
    const recipe = {
      operation: 'image-edit',
      contractVersion: IMAGE_EDIT_CONTRACT_VERSION,
      model,
      sourceIds: ['source'],
      quality: 'medium',
      size: 'source',
      outputs: 1,
      apiKey: 'secret',
      images: ['https://signed-url'],
    };
    const safe = readImageEditingRecipe(recipe);
    expect(safe).not.toHaveProperty('apiKey');
    expect(safe).not.toHaveProperty('images');
    expect(safe?.sourceIds).toEqual(['source']);
    expect(
      readImageEditingRecipe({ ...recipe, model: 'other/edit' }),
    ).toBeUndefined();
    expect(
      readImageEditingRecipe({ ...recipe, sourceIds: [] }),
    ).toBeUndefined();
    expect(readImageEditingRecipe({ ...recipe, outputs: 9 })).toBeUndefined();
    expect(
      readImageEditingRecipe({ ...recipe, quality: 'high' }),
    ).toBeUndefined();
  });
});
