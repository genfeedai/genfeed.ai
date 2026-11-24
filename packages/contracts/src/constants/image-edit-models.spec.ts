import { describe, expect, it } from 'vitest';
import { ModelCategory } from '..';
import {
  DEFAULT_IMAGE_EDIT_MODEL_KEY,
  IMAGE_EDIT_AUTO_MODEL_KEYS,
  IMAGE_EDIT_CONTRACT_VERSION,
  IMAGE_EDIT_MODEL_KEYS,
  isImageEditModel,
  readImageEditingRecipe,
  resolveDefaultImageEditModel,
} from './image-edit-models.constant';
import {
  isMaiImageEditModel,
  MAI_IMAGE_EDIT_CONTRACT_VERSION,
  MAI_IMAGE_EDIT_MODEL_KEYS,
} from './mai-image-edit.constant';
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

  describe('MAI-Image editing', () => {
    const mai = MODEL_KEYS.FAL_MAI_IMAGE_2_7_EDIT;
    const recipe = {
      operation: 'image-edit',
      contractVersion: MAI_IMAGE_EDIT_CONTRACT_VERSION,
      model: mai,
      sourceIds: ['one', 'two'],
      outputs: 1,
      apiKey: 'secret',
    };
    it('joins the editing picker without joining Auto or the default', () => {
      for (const key of MAI_IMAGE_EDIT_MODEL_KEYS) {
        expect(isImageEditModel(key)).toBe(true);
        expect(isMaiImageEditModel(key)).toBe(true);
        expect(IMAGE_EDIT_AUTO_MODEL_KEYS).not.toContain(key);
      }
      expect(IMAGE_EDIT_MODEL_KEYS).toEqual([
        ...IMAGE_EDIT_AUTO_MODEL_KEYS,
        ...MAI_IMAGE_EDIT_MODEL_KEYS,
      ]);
      expect(DEFAULT_IMAGE_EDIT_MODEL_KEY).toBe(
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT,
      );
      expect(
        UNIFIED_MODEL_CATALOG.filter(
          (row) =>
            MAI_IMAGE_EDIT_MODEL_KEYS.includes(row.key) &&
            (row.isDefault || row.category !== ModelCategory.IMAGE_EDIT),
        ),
      ).toEqual([]);
    });
    it('reads only the public recipe fields', () => {
      const safe = readImageEditingRecipe(recipe);
      expect(safe).toEqual({
        operation: 'image-edit',
        contractVersion: MAI_IMAGE_EDIT_CONTRACT_VERSION,
        model: mai,
        sourceIds: ['one', 'two'],
        outputs: 1,
      });
    });
    it.each([
      ['a mask', { maskId: 'mask' }],
      ['a seed', { seed: 0 }],
      ['a fixed size', { size: 'source' }],
      ['a quality tier', { quality: 'medium' }],
      ['a native resolution', { resolution: '1k' }],
      ['an aspect ratio', { aspectRatio: '1:1' }],
      ['two outputs', { outputs: 2 }],
      ['no sources', { sourceIds: [] }],
      ['six sources', { sourceIds: ['1', '2', '3', '4', '5', '6'] }],
      ['repeated sources', { sourceIds: ['1', '1'] }],
      ['another contract version', { contractVersion: 'other' }],
    ])('rejects a recipe with %s', (_name, patch) => {
      expect(readImageEditingRecipe({ ...recipe, ...patch })).toBeUndefined();
    });
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
