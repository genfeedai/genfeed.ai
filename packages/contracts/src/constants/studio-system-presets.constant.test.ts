import { describe, expect, it } from 'vitest';
import { ContentTemplateKey } from '../enums/template.enum';
import {
  STUDIO_SYSTEM_PRESETS,
  studioSystemPresetId,
} from './studio-system-presets.constant';

describe('Studio system presets', () => {
  it('defines the six image/video use cases with canonical content templates and no model override', () => {
    expect(STUDIO_SYSTEM_PRESETS.map((p) => p.label)).toEqual([
      'Profile picture',
      'Banner',
      'YouTube thumbnail',
      'Meme',
      'Animation',
      'Dance',
    ]);
    expect(
      new Set(STUDIO_SYSTEM_PRESETS.map((p) => studioSystemPresetId(p.key)))
        .size,
    ).toBe(6);
    for (const preset of STUDIO_SYSTEM_PRESETS) {
      expect(Object.values(ContentTemplateKey)).toContain(
        preset.values.promptTemplate,
      );
      expect(preset.values).not.toHaveProperty('modelKey');
      expect(preset.values).not.toHaveProperty('prioritize');
      expect(preset.values.aspectRatio).toMatch(/^\d+:\d+$/);
      if (preset.type === 'video') expect(preset.values.duration).toBe(5);
    }
  });
});
