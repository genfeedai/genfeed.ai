import { describe, expect, it } from 'vitest';
import {
  DAILY_TRENDS_DIGEST_CANONICAL_ID,
  isTrendsDigestCloudOperatorEmail,
  TRENDS_DIGEST_CLOUD_OPERATOR_EMAIL,
} from './trends.constant';

describe('isTrendsDigestCloudOperatorEmail', () => {
  it('matches the hosted operator inbox case-insensitively', () => {
    expect(TRENDS_DIGEST_CLOUD_OPERATOR_EMAIL).toBe('vincent@genfeed.ai');
    expect(DAILY_TRENDS_DIGEST_CANONICAL_ID).toBe('daily-trends-digest');
    expect(isTrendsDigestCloudOperatorEmail('vincent@genfeed.ai')).toBe(true);
    expect(isTrendsDigestCloudOperatorEmail('  Vincent@Genfeed.ai  ')).toBe(
      true,
    );
  });

  it('rejects any other recipient', () => {
    expect(isTrendsDigestCloudOperatorEmail('dubay887@gmail.com')).toBe(false);
    expect(isTrendsDigestCloudOperatorEmail('mitchell@mantella.nl')).toBe(
      false,
    );
    expect(isTrendsDigestCloudOperatorEmail('contact@timetosurge.xyz')).toBe(
      false,
    );
    expect(isTrendsDigestCloudOperatorEmail(null)).toBe(false);
    expect(isTrendsDigestCloudOperatorEmail(undefined)).toBe(false);
    expect(isTrendsDigestCloudOperatorEmail('')).toBe(false);
  });
});
