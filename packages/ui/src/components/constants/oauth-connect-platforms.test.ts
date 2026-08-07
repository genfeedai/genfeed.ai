import { CredentialPlatform } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

import {
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
});
