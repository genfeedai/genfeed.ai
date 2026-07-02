import { Platform, PostStatus } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

import { isPlatform, toPlatform, toPostStatus } from './tool-validators';

describe('tool-validators', () => {
  it('accepts every canonical Platform value', () => {
    for (const platform of Object.values(Platform)) {
      expect(isPlatform(platform)).toBe(true);
      expect(toPlatform(platform)).toBe(platform);
    }
  });

  it('accepts every canonical PostStatus value', () => {
    for (const status of Object.values(PostStatus)) {
      expect(toPostStatus(status)).toBe(status);
    }
  });

  it('rejects values outside the canonical enums', () => {
    expect(isPlatform('myspace')).toBe(false);
    expect(toPlatform('myspace')).toBeUndefined();
    expect(toPlatform(undefined)).toBeUndefined();
    expect(toPostStatus('published')).toBeUndefined();
    expect(toPostStatus(null)).toBeUndefined();
  });
});
