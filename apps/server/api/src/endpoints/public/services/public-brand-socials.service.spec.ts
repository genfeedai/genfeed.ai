import { toPublicSocials } from '@api/endpoints/public/services/public-brand-socials.service';
import { describe, expect, it } from 'vitest';

function credential(
  platform: string,
  overrides: {
    externalHandle?: string | null;
    externalId?: string | null;
    username?: string | null;
  } = {},
) {
  return {
    externalHandle: null,
    externalId: null,
    platform,
    username: null,
    ...overrides,
  };
}

describe('toPublicSocials', () => {
  it('links each connected account once, in profile order', () => {
    expect(
      toPublicSocials([
        credential('TWITTER', { username: '@shayla' }),
        credential('INSTAGRAM', { externalHandle: 'itsshaylamonroe' }),
        credential('INSTAGRAM', { externalHandle: 'second_account' }),
        credential('YOUTUBE', { externalId: 'UC123', username: 'shayla' }),
      ]),
    ).toEqual([
      {
        handle: 'itsshaylamonroe',
        platform: 'instagram',
        url: 'https://www.instagram.com/itsshaylamonroe',
      },
      {
        handle: 'shayla',
        platform: 'youtube',
        url: 'https://www.youtube.com/channel/UC123',
      },
      { handle: 'shayla', platform: 'twitter', url: 'https://x.com/shayla' },
    ]);
  });

  it.each([
    ['an account without a handle', credential('TIKTOK')],
    ['an ads account', credential('GOOGLE_ADS', { username: 'acme' })],
    ['an unknown platform', credential('FAX', { username: 'acme' })],
  ])('leaves out %s', (_label, row) => {
    expect(toPublicSocials([row])).toEqual([]);
  });
});
