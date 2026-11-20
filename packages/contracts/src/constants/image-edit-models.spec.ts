import { describe, expect, it } from 'vitest';
import { ModelCategory } from '..';
import {
  DEFAULT_IMAGE_EDIT_MODEL_KEY,
  IMAGE_EDIT_CONTRACT_VERSION,
  readImageEditingRecipe,
  resolveDefaultImageEditModel,
} from './image-edit-models.constant';
import { UNIFIED_MODEL_CATALOG } from './model-catalog.constant';
import { MODEL_KEYS } from './model-keys.constant';

const model = MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5;
describe('dedicated image editing contract', () => {
  it('seeds the registry editing default as an image-edit row, apart from image generation', () => {
    const editDefaults = UNIFIED_MODEL_CATALOG.filter(
      (row) => row.category === ModelCategory.IMAGE_EDIT && row.isDefault,
    );
    expect(editDefaults.map((row) => row.key)).toEqual([
      DEFAULT_IMAGE_EDIT_MODEL_KEY,
    ]);
    expect(editDefaults[0]).toMatchObject({ providerCostUsd: 0.024 });
    expect(
      UNIFIED_MODEL_CATALOG.find((row) => row.key === model),
    ).toMatchObject({
      category: ModelCategory.IMAGE_EDIT,
      isDefault: false,
      providerCostUsd: 0.06,
    });
    expect(
      UNIFIED_MODEL_CATALOG.find(
        (row) => row.category === ModelCategory.IMAGE && row.isDefault,
      )?.key,
    ).not.toBe(DEFAULT_IMAGE_EDIT_MODEL_KEY);
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

  describe('resolveDefaultImageEditModel', () => {
    const flux = MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT;
    it.each([
      ['a plain edit', {}],
      ['one output', { outputs: 1 }],
    ])('keeps the registry default for %s', (_name, controls) => {
      expect(resolveDefaultImageEditModel(flux, controls)).toBe(flux);
    });
    it.each([
      ['a mask', { maskId: 'mask' }],
      ['seed 0', { seed: 0 }],
      ['two outputs', { outputs: 2 }],
      ['a fixed size', { size: '1024x1024' }],
    ])('sends %s to the editor that accepts it', (_name, controls) => {
      expect(resolveDefaultImageEditModel(flux, controls)).toBe(model);
    });
    it('leaves another registry default alone', () => {
      expect(resolveDefaultImageEditModel('provider/editor', { seed: 1 })).toBe(
        'provider/editor',
      );
    });
  });
});
