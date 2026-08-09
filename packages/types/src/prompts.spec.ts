import { describe, expect, it } from 'vitest';
import {
  CAMERA_PRESETS,
  CATEGORY_LABELS,
  LIGHTING_PRESETS,
  MOOD_PRESETS,
  PROMPT_CATEGORIES,
  SCENE_PRESETS,
  STYLE_PRESETS,
} from './prompts';

describe('prompts', () => {
  it('exposes every prompt category exactly once', () => {
    expect(PROMPT_CATEGORIES).toHaveLength(10);
    expect(new Set(PROMPT_CATEGORIES).size).toBe(PROMPT_CATEGORIES.length);
    expect(PROMPT_CATEGORIES).toContain('custom');
  });

  it('labels every prompt category', () => {
    for (const category of PROMPT_CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
    }
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(PROMPT_CATEGORIES.length);
  });

  it('keeps every style preset list non-empty and duplicate-free', () => {
    const presetLists: readonly (readonly string[])[] = [
      MOOD_PRESETS,
      STYLE_PRESETS,
      CAMERA_PRESETS,
      LIGHTING_PRESETS,
      SCENE_PRESETS,
    ];
    for (const presets of presetLists) {
      expect(presets.length).toBeGreaterThan(0);
      expect(new Set(presets).size).toBe(presets.length);
    }
  });

  it('preserves representative preset values', () => {
    expect(MOOD_PRESETS).toContain('cinematic');
    expect(STYLE_PRESETS).toContain('photorealistic');
    expect(CAMERA_PRESETS).toContain('wide-angle');
    expect(LIGHTING_PRESETS).toContain('golden-hour');
    expect(SCENE_PRESETS).toContain('studio');
  });
});
