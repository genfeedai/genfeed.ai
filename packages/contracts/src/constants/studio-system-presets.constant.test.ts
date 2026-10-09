import { describe, expect, it } from 'vitest';
import { ContentTemplateKey } from '../enums/template.enum';
import {
  resolveStudioSystemPresets,
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
  it('reads operator edits without restoring cleared seed settings or pinning a model', () => {
    const row = {
      id: studioSystemPresetId('studio-banner'),
      organizationId: null,
      brandId: null,
      isActive: true,
      isDeleted: false,
      category: 'video' as never,
      label: 'Updated campaign',
      description: 'Admin description',
      prompt: 'New prompt',
      aspectRatio: '9:16',
      duration: 8,
      style: '',
      lighting: 'neon',
      model: 'manual-model',
    };
    expect(resolveStudioSystemPresets([row], 'image')).toEqual([]);
    expect(resolveStudioSystemPresets([row], 'video')).toEqual([
      {
        key: 'studio-banner',
        type: 'video',
        label: 'Updated campaign',
        description: 'Admin description',
        prompt: 'New prompt',
        values: {
          aspectRatio: '9:16',
          duration: 8,
          style: '',
          lighting: 'neon',
        },
      },
    ]);
  });
  it.each([
    { organizationId: 'foreign-org' },
    { brandId: 'foreign-brand' },
    { organizationId: undefined },
    { isActive: false },
    { isDeleted: true },
    { aspectRatio: '0:16' },
    { duration: Number.NaN },
    { label: '' },
  ])('rejects ineligible persisted templates: %j', (override) => {
    const seed = STUDIO_SYSTEM_PRESETS[0];
    expect(
      resolveStudioSystemPresets(
        [
          {
            id: studioSystemPresetId(seed.key),
            organizationId: null,
            brandId: null,
            category: 'image' as never,
            isActive: true,
            isDeleted: false,
            label: seed.label,
            prompt: seed.prompt,
            ...seed.values,
            ...override,
          },
        ],
        'image',
      ),
    ).toEqual([]);
  });
});
