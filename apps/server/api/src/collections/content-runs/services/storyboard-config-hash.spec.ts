import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';
import { describe, expect, it } from 'vitest';

describe('storyboardConfigHash', () => {
  it('orders keys by code point so hashes stay stable across locales', () => {
    const original = String.prototype.localeCompare;
    String.prototype.localeCompare = function localeCompare() {
      return 1;
    };
    try {
      expect(storyboardConfigHash({ aa: 1, z: 2 })).toBe(
        storyboardConfigHash({ z: 2, aa: 1 }),
      );
    } finally {
      String.prototype.localeCompare = original;
    }
  });
});
