import { describe, expect, it } from 'vitest';
import { ASPECT_RATIOS } from './model-aspect-ratios.constant';

describe('model-aspect-ratios.constant', () => {
  it('exports ASPECT_RATIOS object', () => {
    expect(ASPECT_RATIOS).toBeDefined();
    expect(typeof ASPECT_RATIOS).toBe('object');
  });

  it('all groups are non-empty arrays of strings', () => {
    for (const [, ratios] of Object.entries(ASPECT_RATIOS)) {
      expect(Array.isArray(ratios)).toBe(true);
      expect(ratios.length).toBeGreaterThan(0);
      for (const ratio of ratios) {
        expect(typeof ratio).toBe('string');
      }
    }
  });

  it('FLUX_KONTEXT includes common ratios', () => {
    expect(ASPECT_RATIOS.FLUX_KONTEXT).toContain('1:1');
    expect(ASPECT_RATIOS.FLUX_KONTEXT).toContain('16:9');
    expect(ASPECT_RATIOS.FLUX_KONTEXT).toContain('9:16');
  });
});
