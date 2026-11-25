import { describe, expect, it } from 'vitest';
import {
  PUBLISHING_QUOTA_CEILINGS,
  PUBLISHING_QUOTA_KEYS,
  PUBLISHING_QUOTA_MAX,
  PUBLISHING_QUOTA_TRIAL_LIMIT,
  resolveEffectivePublishingQuota,
  resolvePublishingQuotaCeiling,
} from '../../src/constants/publishing-quota.constant';

describe('publishing quota tiers', () => {
  it('holds a never-paid organization to one post a day on every platform', () => {
    for (const key of PUBLISHING_QUOTA_KEYS) {
      expect(resolveEffectivePublishingQuota('trial', key, 15)).toBe(
        PUBLISHING_QUOTA_TRIAL_LIMIT,
      );
      expect(resolveEffectivePublishingQuota('trial', key, 0)).toBe(1);
      expect(resolveEffectivePublishingQuota('trial', key, 1000)).toBe(1);
    }
  });

  it('keeps every ceiling for credits at 5 and a plan above credits', () => {
    for (const key of PUBLISHING_QUOTA_KEYS) {
      expect(PUBLISHING_QUOTA_CEILINGS.credits[key]).toBe(5);
      expect(PUBLISHING_QUOTA_CEILINGS.plan[key]).toBeGreaterThan(5);
    }
  });

  it('cuts an owner cap to the tier ceiling and never leaves a paid tier unmetered', () => {
    expect(resolveEffectivePublishingQuota('credits', 'quotaTwitter', 15)).toBe(
      5,
    );
    expect(resolveEffectivePublishingQuota('credits', 'quotaTiktok', 1)).toBe(
      1,
    );
    expect(resolveEffectivePublishingQuota('plan', 'quotaTwitter', 15)).toBe(
      15,
    );
    expect(resolveEffectivePublishingQuota('plan', 'quotaTwitter', 1000)).toBe(
      25,
    );
    expect(resolveEffectivePublishingQuota('plan', 'quotaYoutube', 0)).toBe(10);
    expect(
      resolveEffectivePublishingQuota('credits', 'quotaYoutube', undefined),
    ).toBe(5);
  });

  it('leaves the owner cap alone without organization billing, 0 staying unmetered', () => {
    expect(
      resolveEffectivePublishingQuota('unmetered', 'quotaTwitter', 300),
    ).toBe(300);
    expect(
      resolveEffectivePublishingQuota('unmetered', 'quotaTwitter', 0),
    ).toBe(0);
    expect(resolvePublishingQuotaCeiling('unmetered', 'quotaTwitter')).toBe(
      PUBLISHING_QUOTA_MAX,
    );
  });
});
