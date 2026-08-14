import { describe, expect, it } from 'vitest';
import {
  ARTICLE_PUBLISH_PLATFORMS,
  PLATFORM_CONFIG,
  PUBLISH_PLATFORMS,
} from './platforms.constant';

describe('platforms.constant', () => {
  it('aligns publish platform ids with PLATFORM_CONFIG keys and labels', () => {
    expect(Object.keys(PLATFORM_CONFIG).sort()).toEqual(
      [...PUBLISH_PLATFORMS.map((entry) => entry.platform)].sort(),
    );

    for (const entry of PUBLISH_PLATFORMS) {
      expect(PLATFORM_CONFIG[entry.platform]?.label).toBe(entry.label);
      expect(PLATFORM_CONFIG[entry.platform]?.color.startsWith('bg-')).toBe(
        true,
      );
    }
  });

  it('limits article publishing to a subset of publish platforms', () => {
    const publishIds = new Set(
      PUBLISH_PLATFORMS.map((entry) => entry.platform),
    );

    for (const entry of ARTICLE_PUBLISH_PLATFORMS) {
      expect(publishIds.has(entry.platform)).toBe(true);
      expect(PLATFORM_CONFIG[entry.platform]?.label).toBe(entry.label);
    }
  });
});
