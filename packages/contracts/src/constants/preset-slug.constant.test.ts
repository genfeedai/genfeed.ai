import { describe, expect, it } from 'vitest';
import { PRESET_CATALOG } from './preset-catalog.constant';
import { presetSlug } from './preset-slug.constant';

describe('presetSlug', () => {
  it('writes the label as a person would type it', () => {
    expect(presetSlug('UGC selfie ad')).toBe('ugc-selfie-ad');
    expect(presetSlug('YouTube thumbnail')).toBe('youtube-thumbnail');
    expect(presetSlug('Case-study slide')).toBe('case-study-slide');
    expect(presetSlug('  Stat or insight card! ')).toBe('stat-or-insight-card');
  });

  it('gives every catalog preset its own address-safe slug', () => {
    const slugs = PRESET_CATALOG.map((preset) => presetSlug(preset.label));

    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
