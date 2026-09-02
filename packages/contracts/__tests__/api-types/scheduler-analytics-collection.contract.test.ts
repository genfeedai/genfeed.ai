import { describe, expect, test } from 'vitest';
import { CredentialPlatform, TargetAnalyticsCapability } from '../../src';
import { getSchedulerAnalyticsCapability } from '../../src/api-types/contracts/scheduler-analytics-collection.contract';

describe('scheduler analytics collection capability', () => {
  test('declares provider-specific freshness windows', () => {
    expect(getSchedulerAnalyticsCapability(CredentialPlatform.TWITTER)).toEqual(
      {
        freshnessWindowMs: 60 * 60 * 1000,
        status: TargetAnalyticsCapability.SUPPORTED,
      },
    );
    expect(getSchedulerAnalyticsCapability(CredentialPlatform.YOUTUBE)).toEqual(
      {
        freshnessWindowMs: 2 * 60 * 60 * 1000,
        status: TargetAnalyticsCapability.SUPPORTED,
      },
    );
  });

  test('makes unsupported provider gaps explicit', () => {
    expect(getSchedulerAnalyticsCapability(CredentialPlatform.DISCORD)).toEqual(
      {
        freshnessWindowMs: null,
        status: TargetAnalyticsCapability.UNSUPPORTED,
      },
    );
  });
});
