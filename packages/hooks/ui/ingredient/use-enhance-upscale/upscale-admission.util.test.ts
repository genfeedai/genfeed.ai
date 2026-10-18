import { IngredientCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IIngredient, IModel } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { getUpscaleAdmission } from './upscale-admission.util';

const image = {
  id: 'image',
  category: IngredientCategory.IMAGE,
} as IIngredient;
const video = {
  id: 'video',
  category: IngredientCategory.VIDEO,
} as IIngredient;
const topaz = {
  key: MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
  cost: 20,
  label: 'Topaz',
} as IModel;
const bytedance = {
  key: MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER,
  cost: 30,
  label: 'ByteDance',
} as IModel;
describe('canonical upscale preparation and availability', () => {
  it('keeps Topaz selection even when ByteDance precedes it', () => {
    const admission = getUpscaleAdmission(video, [], [bytedance, topaz]);
    expect(admission.confirmation?.modelKey).toBe(topaz.key);
    expect(
      admission.confirmation?.videoModelOptions?.map((model) => model.key),
    ).toEqual([bytedance.key, topaz.key]);
  });
  it('uses the already supported ByteDance fallback only when Topaz is absent', () => {
    expect(
      getUpscaleAdmission(video, [], [bytedance]).confirmation?.modelKey,
    ).toBe(bytedance.key);
  });
  it('does not substitute a priced provider for an unknown selected-provider quote', () => {
    const admission = getUpscaleAdmission(
      video,
      [],
      [{ ...topaz, cost: Number.NaN }, bytedance],
    );
    expect(admission.availability).toEqual({
      isAvailable: false,
      reason: 'priceUnavailable',
    });
    expect(admission.confirmation).toBeUndefined();
  });
  it('preserves an explicit zero image-upscale price', () => {
    const admission = getUpscaleAdmission(
      image,
      [{ ...topaz, key: MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE, cost: 0 }],
      [],
    );
    expect(admission.availability.isAvailable).toBe(true);
    expect(admission.confirmation?.cost).toBe(0);
  });
  it('reports absent configured models without inventing a price or capability', () => {
    expect(getUpscaleAdmission(image, [], []).availability).toEqual({
      isAvailable: false,
      reason: 'modelUnavailable',
    });
  });
});
