import {
  readAdsChannel,
  readAdsPlatform,
} from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { AdsChannel, AdsPlatform } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

/**
 * `readAdsPlatform` is the gate on `list_ads_research` / `get_ad_research_detail`
 * — a platform it rejects is silently dropped from the filters, so the tool
 * answers about the wrong platform instead of erroring. It must accept exactly
 * the `AdsPlatform` product-channel enum.
 */
describe('readAdsPlatform', () => {
  it('accepts AdsPlatform.GOOGLE, not CredentialPlatform.GOOGLE_ADS', () => {
    expect(readAdsPlatform(AdsPlatform.GOOGLE)).toBe(AdsPlatform.GOOGLE);
    expect(readAdsPlatform('google_ads')).toBeUndefined();
  });

  it.each([
    'tiktok_ads',
    'TikTok',
    'facebook',
    'linkedin',
    '',
    undefined,
    null,
    42,
  ])('rejects %s', (value) => {
    expect(readAdsPlatform(value)).toBeUndefined();
  });
});

describe('readAdsChannel', () => {
  it('accepts AdsChannel.YOUTUBE as youtube inventory, not CredentialPlatform', () => {
    expect(readAdsChannel(AdsChannel.YOUTUBE)).toBe(AdsChannel.YOUTUBE);
  });
});
