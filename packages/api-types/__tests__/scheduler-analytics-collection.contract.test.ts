import { getSchedulerAnalyticsCapability } from '@api-types/contracts/scheduler-analytics-collection.contract';
import {
  CredentialPlatform,
  TargetAnalyticsCapability,
} from '@genfeedai/enums';
import { describe, expect, test } from 'vitest';

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
