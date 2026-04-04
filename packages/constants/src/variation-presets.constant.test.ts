import { describe, expect, it } from 'vitest';
import { VARIATION_PROMPT_PRESETS } from './variation-presets.constant';

describe('variation-presets.constant', () => {
  it('has 3 presets', () => {
    expect(VARIATION_PROMPT_PRESETS).toHaveLength(3);
  });

  it('has expected keys in order', () => {
    expect(VARIATION_PROMPT_PRESETS.map((p) => p.key)).toEqual([
      'similar',
      'color',
      'style',
    ]);
  });

  it('each preset has key, label, and prompt', () => {
    for (const preset of VARIATION_PROMPT_PRESETS) {
      expect(preset.key).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.prompt).toBeTruthy();
    }
  });
});
