import { CredentialPlatform } from '@genfeedai/enums';
import {
  GoogleColorIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { Star } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import {
  groupOAuthConnectPlatforms,
  OAUTH_CONNECT_PLATFORMS,
  resolveOAuthConnectPlatformCatalog,
  resolveOAuthServicePath,
} from './oauth-connect-platforms';

describe('resolveOAuthServicePath', () => {
  it('prefers an explicit servicePath', () => {
    expect(resolveOAuthServicePath('google_ads', 'google-ads')).toBe(
      'google-ads',
    );
  });

  it('hyphenates underscore CredentialPlatform values', () => {
    expect(resolveOAuthServicePath(CredentialPlatform.GOOGLE_ADS)).toBe(
      'google-ads',
    );
    expect(resolveOAuthServicePath('twitter')).toBe('twitter');
  });
});

describe('OAUTH_CONNECT_PLATFORMS ads tiles', () => {
  it('exposes Meta Ads via Facebook OAuth and YouTube Ads via Google Ads', () => {
    const meta = OAUTH_CONNECT_PLATFORMS.find(
      (p) => p.connectId === 'meta-ads',
    );
    const youtubeAds = OAUTH_CONNECT_PLATFORMS.find(
      (p) => p.connectId === 'youtube-ads',
    );
    const googleAds = OAUTH_CONNECT_PLATFORMS.find(
      (p) => p.connectId === 'google-ads',
    );

    expect(meta?.platform).toBe(CredentialPlatform.FACEBOOK);
    expect(meta?.servicePath).toBe('facebook');
    expect(youtubeAds?.platform).toBe(CredentialPlatform.GOOGLE_ADS);
    expect(youtubeAds?.servicePath).toBe('google-ads');
    expect(googleAds?.servicePath).toBe('google-ads');
  });

  it('gives each ads tile its own brand mark even when they share a platform', () => {
    const googleAds = OAUTH_CONNECT_PLATFORMS.find(
      (p) => p.connectId === 'google-ads',
    );
    const youtubeAds = OAUTH_CONNECT_PLATFORMS.find(
      (p) => p.connectId === 'youtube-ads',
    );
    const youtube = OAUTH_CONNECT_PLATFORMS.find(
      (p) => p.platform === CredentialPlatform.YOUTUBE,
    );

    // Both tiles authenticate through GOOGLE_ADS; resolving the icon from the
    // platform painted a Google "G" on the YouTube Ads card.
    expect(googleAds?.Icon).toBe(GoogleColorIcon);
    expect(youtubeAds?.Icon).toBe(YoutubeIcon);
    expect(youtubeAds?.Icon).toBe(youtube?.Icon);
    expect(googleAds?.Icon).not.toBe(youtubeAds?.Icon);
  });
});

describe('OAUTH_CONNECT_PLATFORMS catalog', () => {
  it.each(['unknown', 'unavailable'] as const)(
    'fails Threads closed when readiness is %s',
    (readiness) => {
      const threads = resolveOAuthConnectPlatformCatalog({
        threads: readiness,
      }).find((item) => item.platform === CredentialPlatform.THREADS);

      expect(threads).toMatchObject({
        isConnectAvailable: false,
        readiness,
      });
    },
  );

  it('enables one canonical Threads service path when readiness is available', () => {
    const threads = resolveOAuthConnectPlatformCatalog({
      threads: 'available',
    }).filter((item) => item.platform === CredentialPlatform.THREADS);

    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      isConnectAvailable: true,
      readiness: 'available',
    });
    expect(
      resolveOAuthServicePath(
        threads[0]?.platform ?? '',
        threads[0]?.servicePath,
      ),
    ).toBe('threads');
  });

  it('retains the existing order and behavior for platforms without readiness gates', () => {
    const withoutThreads = (platforms: typeof OAUTH_CONNECT_PLATFORMS) =>
      platforms
        .filter((item) => item.platform !== CredentialPlatform.THREADS)
        .map((item) => item.connectId ?? item.platform);

    expect(
      withoutThreads(
        resolveOAuthConnectPlatformCatalog({ threads: 'unavailable' }),
      ),
    ).toEqual(withoutThreads(OAUTH_CONNECT_PLATFORMS));
    expect(
      resolveOAuthConnectPlatformCatalog({ threads: 'unavailable' })
        .filter((item) => item.platform !== CredentialPlatform.THREADS)
        .every((item) => item.isConnectAvailable),
    ).toBe(true);
  });

  it('omits Reddit while Genfeed lacks approved Reddit Data API access', () => {
    expect(
      OAUTH_CONNECT_PLATFORMS.some(
        (p) => p.platform === CredentialPlatform.REDDIT,
      ),
    ).toBe(false);
    expect(
      groupOAuthConnectPlatforms().some((group) => group.id === 'communities'),
    ).toBe(false);
  });

  it('includes Fanvue under Creator through its existing service route', () => {
    const fanvue = OAUTH_CONNECT_PLATFORMS.find(
      (p) => p.platform === CredentialPlatform.FANVUE,
    );

    expect(fanvue).toBeDefined();
    expect(fanvue?.label).toBe('Fanvue');
    expect(fanvue?.category).toBe('creator');
    expect(fanvue?.servicePath).toBe('fanvue');
    expect(fanvue?.Icon).toBe(Star);
    expect(fanvue?.iconClassName).toBe('text-violet-500');
    expect(
      groupOAuthConnectPlatforms().some((group) => group.label === 'Creator'),
    ).toBe(true);
    expect(
      resolveOAuthServicePath(fanvue?.platform ?? '', fanvue?.servicePath),
    ).toBe('fanvue');
  });

  it('omits X Ads while its OAuth 1.0a migration is incomplete', () => {
    expect(
      OAUTH_CONNECT_PLATFORMS.some(
        (p) => p.platform === CredentialPlatform.X_ADS,
      ),
    ).toBe(false);
  });

  it('includes Restream under video for multistream chat OAuth', () => {
    const restream = OAUTH_CONNECT_PLATFORMS.find(
      (p) => p.platform === CredentialPlatform.RESTREAM,
    );
    expect(restream).toBeDefined();
    expect(restream?.label).toBe('Restream');
    expect(restream?.category).toBe('video');
    expect(restream?.servicePath).toBe('restream');
    expect(
      resolveOAuthServicePath(restream?.platform ?? '', restream?.servicePath),
    ).toBe('restream');
  });

  it('carries an icon and colour for every tile', () => {
    for (const platform of OAUTH_CONNECT_PLATFORMS) {
      // React component types may be functions or wrapper objects such as
      // forwardRef; the catalog contract is that an icon is present.
      expect(platform.Icon).toBeTruthy();
      expect(platform.iconClassName).toBeTruthy();
    }
  });
});
