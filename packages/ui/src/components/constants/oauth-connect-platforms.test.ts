import { CredentialPlatform } from '@genfeedai/enums';
import {
  GoogleColorIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { describe, expect, it } from 'vitest';

import {
  groupOAuthConnectPlatforms,
  OAUTH_CONNECT_PLATFORMS,
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
  it('omits Fanvue, which has no OAuth connect route', () => {
    expect(
      OAUTH_CONNECT_PLATFORMS.some(
        (p) => p.platform === CredentialPlatform.FANVUE,
      ),
    ).toBe(false);
    expect(
      groupOAuthConnectPlatforms().some((group) => group.label === 'Creator'),
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
      resolveOAuthServicePath(restream!.platform, restream?.servicePath),
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
