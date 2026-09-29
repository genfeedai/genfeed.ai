import { describe, expect, it } from 'vitest';
import { VARIATION_PROMPT_PRESETS } from './variation-presets.constant';

describe('variation-presets.constant', () => {
  it('has expected keys in order', () => {
    expect(VARIATION_PROMPT_PRESETS.map((p) => p.key)).toEqual([
      'similar',
      'color',
      'style',
    ]);
  });
});
