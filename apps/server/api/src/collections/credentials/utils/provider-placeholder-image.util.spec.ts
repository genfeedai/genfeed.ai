import { describe, expect, it } from 'vitest';
import {
  isMirrorableAvatarUrl,
  isProviderPlaceholderImageUrl,
} from './provider-placeholder-image.util';

describe('isProviderPlaceholderImageUrl', () => {
  it.each([
    'https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png',
    'https://mastodon.social/avatars/original/missing.png',
    'https://mastodon.social/headers/original/missing.png',
    'https://www.redditstatic.com/avatars/defaults/v2/avatar_default_3.png',
  ])('flags %s', (url) => {
    expect(isProviderPlaceholderImageUrl(url)).toBe(true);
  });

  it.each([
    'https://pbs.twimg.com/profile_images/1/abc_400x400.jpg',
    'not a url',
  ])('does not flag %s', (url) => {
    expect(isProviderPlaceholderImageUrl(url)).toBe(false);
  });
});

describe('isMirrorableAvatarUrl', () => {
  it('accepts real avatars and rejects empty or placeholder ones', () => {
    expect(
      isMirrorableAvatarUrl('https://pbs.twimg.com/profile_images/1/a.jpg'),
    ).toBe(true);
    expect(isMirrorableAvatarUrl(undefined)).toBe(false);
    expect(isMirrorableAvatarUrl('')).toBe(false);
    expect(
      isMirrorableAvatarUrl(
        'https://mastodon.social/avatars/original/missing.png',
      ),
    ).toBe(false);
  });
});
