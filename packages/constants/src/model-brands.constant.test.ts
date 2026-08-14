import { describe, expect, it } from 'vitest';
import { MODEL_BRANDS } from './model-brands.constant';

describe('MODEL_BRANDS', () => {
  it('assigns a local icon key to every catalog brand', () => {
    const missingIconKeys = Object.entries(MODEL_BRANDS)
      .filter(([, config]) => !config.iconKey)
      .map(([slug]) => slug);

    expect(missingIconKeys).toEqual([]);
  });
});
