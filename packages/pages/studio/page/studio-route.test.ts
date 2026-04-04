import {
  buildStudioPath,
  canonicalizeStudioType,
  shouldRedirectStudioTypeRoute,
} from '@pages/studio/page/studio-route';
import { describe, expect, it } from 'vitest';

describe('studio-route', () => {
  it('canonicalizes plural aliases to singular routes', () => {
    expect(canonicalizeStudioType('images')).toBe('image');
    expect(canonicalizeStudioType('videos')).toBe('video');
    expect(canonicalizeStudioType('avatars')).toBe('avatar');
  });

  it('normalizes casing on route segments', () => {
    expect(canonicalizeStudioType('Image')).toBe('image');
  });

  it('falls back to image for unknown types', () => {
    expect(canonicalizeStudioType('unknown')).toBe('image');
  });

  it('builds canonical studio paths and strips legacy type query params', () => {
    expect(
      buildStudioPath('images', {
        foo: 'bar',
        type: 'images',
      }),
    ).toBe('/studio/image?foo=bar');
  });

  it('flags non-canonical studio type routes for redirect', () => {
    expect(shouldRedirectStudioTypeRoute('images')).toBe(true);
    expect(shouldRedirectStudioTypeRoute('image')).toBe(false);
    expect(shouldRedirectStudioTypeRoute('image', { type: 'image' })).toBe(
      true,
    );
  });
});
