import {
  isAcceptedCampaignStatus,
  isPausedCampaignStatus,
  resolveProviderCampaignStatus,
  resolveProviderPausedStatus,
  UNIFIED_PAUSED_CAMPAIGN_STATUS,
} from '@api/services/ads-gateway/ads-campaign-status.util';
import type { AdsPlatform } from '@genfeedai/interfaces';

describe('ads-campaign-status.util', () => {
  describe('isPausedCampaignStatus', () => {
    it('accepts only the exact unified paused value', () => {
      expect(isPausedCampaignStatus(UNIFIED_PAUSED_CAMPAIGN_STATUS)).toBe(true);
    });

    it.each(['paused', 'Paused', ' PAUSED', 'PAUSED ', 'ACTIVE', '', null, 0])(
      'rejects %p',
      (status) => {
        expect(isPausedCampaignStatus(status)).toBe(false);
      },
    );
  });

  describe('isAcceptedCampaignStatus', () => {
    it('accepts an omitted status as paused intent', () => {
      expect(isAcceptedCampaignStatus(undefined)).toBe(true);
    });

    it('accepts the exact paused value', () => {
      expect(isAcceptedCampaignStatus('PAUSED')).toBe(true);
    });

    it.each(['ACTIVE', 'active', 'paused', 'ENABLE', 'DISABLE', '', null])(
      'rejects %p',
      (status) => {
        expect(isAcceptedCampaignStatus(status)).toBe(false);
      },
    );
  });

  describe('resolveProviderPausedStatus', () => {
    it.each([
      ['meta', 'PAUSED'],
      ['google', 'PAUSED'],
      ['x', 'PAUSED'],
      ['tiktok', 'DISABLE'],
    ] as Array<[AdsPlatform, string]>)(
      'maps %s to its provider paused value',
      (platform, expected) => {
        expect(resolveProviderPausedStatus(platform)).toBe(expected);
      },
    );
  });

  describe('resolveProviderCampaignStatus', () => {
    it('keeps an omitted status omitted so updates never mutate serving state', () => {
      expect(resolveProviderCampaignStatus('meta', undefined)).toBeUndefined();
    });

    it.each([
      ['meta', 'PAUSED'],
      ['tiktok', 'DISABLE'],
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
