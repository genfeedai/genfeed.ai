import { TargetExecutionState } from '@genfeedai/contracts';
import {
  readScheduledDeliveryRecord,
  readScheduledDeliveryRequest,
  readScheduledDeliveryResult,
} from '@workers/services/scheduled-post-delivery-input.util';
import { describe, expect, it } from 'vitest';

describe('scheduled delivery input readers', () => {
  it.each([
    'manual_retry',
    'publish_now',
    'scheduled_sweep',
    'tiktok_app',
  ] as const)('preserves the %s request identity', (source) => {
    expect(
      readScheduledDeliveryRequest({
        organizationId: 'org',
        postId: 'post',
        source,
      }),
    ).toEqual({ organizationId: 'org', postId: 'post', source });
  });

  it('rejects an unsupported delivery source', () => {
    expect(() =>
      readScheduledDeliveryRequest({
        organizationId: 'org',
        postId: 'post',
        source: 'unknown',
      }),
    ).toThrow('Scheduled post delivery received invalid source unknown');
  });

  it.each(['organizationId', 'postId'] as const)(
    'rejects missing %s',
    (field) => {
      expect(() =>
        readScheduledDeliveryRequest({
          organizationId: 'org',
          postId: 'post',
          source: 'publish_now',
          [field]: undefined,
        }),
      ).toThrow('Scheduled post delivery requires organizationId and postId');
    },
  );

  it.each([null, undefined, [], 'text', 1])(
    'rejects non-record input at row %#',
    (value) => {
      expect(readScheduledDeliveryRecord(value)).toEqual({});
      expect(() => readScheduledDeliveryRequest(value)).toThrow(
        /invalid source/,
      );
    },
  );

  it('preserves the allowed replay result fields without copying untrusted extras', () => {
    expect(
      readScheduledDeliveryResult({
        error: 'provider message',
        executionState: TargetExecutionState.PUBLISHED,
        externalId: 'external',
        isProviderDraft: true,
        platform: 'twitter',
        success: true,
        url: 'https://example.test/post',
        arbitrary: 'not copied',
      }),
    ).toEqual({
      error: 'provider message',
      executionState: TargetExecutionState.PUBLISHED,
      externalId: 'external',
      isProviderDraft: true,
      platform: 'twitter',
      success: true,
      url: 'https://example.test/post',
    });
  });

  it('does not turn malformed replay flags into success or provider draft', () => {
    expect(
      readScheduledDeliveryResult({
        error: 7,
        executionState: 'unknown',
        externalId: 8,
        isProviderDraft: 'true',
        platform: 9,
        success: 'true',
        url: 10,
      }),
    ).toEqual({
      executionState: TargetExecutionState.FAILED,
      externalId: null,
      platform: '',
      success: false,
      url: '',
    });
  });
});
