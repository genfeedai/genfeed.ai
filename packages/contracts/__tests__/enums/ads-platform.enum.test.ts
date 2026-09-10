import { describe, expect, it } from 'vitest';
import {
  AdsPlatform,
  adsPlatformValues,
  isAdsPlatform,
} from '../../src/interfaces/integrations/ads-gateway.interface';
import {
  AdsChannel,
  adsChannelValues,
  isAdsChannel,
} from '../../src/interfaces/integrations/ads-research.interface';

describe('AdsPlatform', () => {
  it('keeps product-channel labels, not CredentialPlatform google_ads', () => {
    expect(adsPlatformValues).toEqual([
      AdsPlatform.META,
      AdsPlatform.GOOGLE,
      AdsPlatform.TIKTOK,
      AdsPlatform.X,
    ]);
    expect(AdsPlatform.GOOGLE).toBe('google');
    expect(isAdsPlatform(AdsPlatform.GOOGLE)).toBe(true);
    expect(isAdsPlatform('google_ads')).toBe(false);
  });
});

describe('AdsChannel', () => {
  it('accepts Google inventory channels including youtube', () => {
    expect(adsChannelValues).toEqual([
      AdsChannel.ALL,
      AdsChannel.SEARCH,
      AdsChannel.DISPLAY,
      AdsChannel.YOUTUBE,
    ]);
    expect(isAdsChannel(AdsChannel.YOUTUBE)).toBe(true);
    expect(isAdsChannel('shopping')).toBe(false);
  });
});
