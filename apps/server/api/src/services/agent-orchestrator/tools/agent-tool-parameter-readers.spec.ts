import {
  readAdsChannel,
  readAdsPlatform,
  readAdsSource,
} from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { describe, expect, it } from 'vitest';

/**
 * `readAdsPlatform` is the gate on `list_ads_research` / `get_ad_research_detail`
 * — a platform it rejects is silently dropped from the filters, so the tool
 * answers about the wrong platform instead of erroring. It must accept exactly
 * the `AdsResearchPlatform` union.
 */
describe('readAdsPlatform', () => {
  it.each(['meta', 'google', 'tiktok', 'x'])('accepts %s', (platform) => {
    expect(readAdsPlatform(platform)).toBe(platform);
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

describe('readAdsSource', () => {
  it.each(['public', 'my_accounts', 'all'])('accepts %s', (source) => {
    expect(readAdsSource(source)).toBe(source);
  });

  it('rejects an unknown source', () => {
    expect(readAdsSource('connected')).toBeUndefined();
  });
});

describe('readAdsChannel', () => {
  it.each(['all', 'search', 'display', 'youtube'])('accepts %s', (channel) => {
    expect(readAdsChannel(channel)).toBe(channel);
  });

  it('rejects an unknown channel', () => {
    expect(readAdsChannel('shopping')).toBeUndefined();
  });
});
