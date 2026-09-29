import {
  isPausedCampaignStatus,
  resolveProviderCampaignStatus,
  resolveProviderPausedStatus,
  UNIFIED_PAUSED_CAMPAIGN_STATUS,
} from '@api/services/ads-gateway/ads-campaign-status.util';
import { AdsPlatform } from '@genfeedai/contracts/interfaces';

describe('ads-campaign-status.util', () => {
  describe('isPausedCampaignStatus', () => {
    it('accepts only the exact unified paused value', () => {
      expect(isPausedCampaignStatus(UNIFIED_PAUSED_CAMPAIGN_STATUS)).toBe(true);
    });
  });

  describe('resolveProviderPausedStatus', () => {
    it.each([
      [AdsPlatform.META, 'PAUSED'],
      [AdsPlatform.GOOGLE, 'PAUSED'],
      [AdsPlatform.X, 'PAUSED'],
      [AdsPlatform.TIKTOK, 'DISABLE'],
    ] as Array<[AdsPlatform, string]>)(
      'maps %s to its provider paused value',
      (platform, expected) => {
        expect(resolveProviderPausedStatus(platform)).toBe(expected);
      },
    );
  });

  describe('resolveProviderCampaignStatus', () => {
    it.each([
      [AdsPlatform.META, 'PAUSED'],
      [AdsPlatform.TIKTOK, 'DISABLE'],
    ] as Array<[AdsPlatform, string]>)(
      'translates a supplied PAUSED to the %s value',
      (platform, expected) => {
        expect(resolveProviderCampaignStatus(platform, 'PAUSED')).toBe(
          expected,
        );
      },
    );
  });
});
