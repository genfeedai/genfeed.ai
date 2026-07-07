import {
  classifyPublishWebhookError,
  createPublishWebhookEventId,
  PUBLISH_WEBHOOK_SCHEMA_VERSION,
  publishWebhookPayloadSchema,
  redactPublishWebhookText,
} from '@api-types/contracts/publish-webhook-events.contract';
import { ReleaseStatus, TargetExecutionState } from '@genfeedai/enums';
import { describe, expect, test } from 'vitest';

const target = {
  credential: { id: 'cred_123' },
  externalProviderId: 'post_123',
  externalShortcode: 'abc123',
  id: 'target_123',
  platform: 'twitter',
  publishedAt: '2026-07-07T10:00:00.000Z',
  scheduledAt: '2026-07-07T09:55:00.000Z',
  status: TargetExecutionState.PUBLISHED,
  url: 'https://x.com/example/status/post_123',
};

describe('publishWebhookPayloadSchema', () => {
  test('accepts a versioned target published payload', () => {
    const result = publishWebhookPayloadSchema.safeParse({
      event: 'target.published',
      eventId: 'publish:target.published:release_123:target_123:published',
      occurredAt: '2026-07-07T10:00:00.000Z',
      release: {
        id: 'release_123',
        publishedAt: '2026-07-07T10:00:00.000Z',
        scheduledAt: '2026-07-07T09:55:00.000Z',
        status: ReleaseStatus.PUBLISHED,
        targetSummary: {
          failed: 0,
          published: 1,
          total: 1,
        },
      },
      schemaVersion: PUBLISH_WEBHOOK_SCHEMA_VERSION,
      target,
      timestamp: '2026-07-07T10:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  test('requires targets on release payloads', () => {
    const result = publishWebhookPayloadSchema.safeParse({
      event: 'release.published',
      eventId: 'publish:release.published:release_123:release:published',
      occurredAt: '2026-07-07T10:00:00.000Z',
      release: {
        id: 'release_123',
        status: ReleaseStatus.PUBLISHED,
        targetSummary: {
          failed: 0,
          published: 1,
          total: 1,
        },
      },
      schemaVersion: PUBLISH_WEBHOOK_SCHEMA_VERSION,
      timestamp: '2026-07-07T10:00:00.000Z',
    });

    expect(result.success).toBe(false);
  });
});

describe('publish webhook helpers', () => {
  test('creates deterministic event ids', () => {
    expect(
      createPublishWebhookEventId({
        event: 'target.published',
        releaseId: 'Release 123',
        status: TargetExecutionState.PUBLISHED,
        targetId: 'Target 123',
      }),
    ).toBe('publish:target.published:release-123:target-123:published');
  });

  test('classifies common terminal publish errors', () => {
    expect(classifyPublishWebhookError('Quota exceeded')).toBe('rate_limit');
    expect(classifyPublishWebhookError('Credential token expired')).toBe(
      'credential',
    );
    expect(classifyPublishWebhookError('Unsupported platform')).toBe(
      'validation',
    );
  });

  test('redacts secret-like text from error messages', () => {
    expect(
      redactPublishWebhookText(
        'Provider failed with access_token=abc123 and Bearer xyz987',
      ),
    ).toBe(
      'Provider failed with access_token=[REDACTED] and Bearer [REDACTED]',
    );
  });
});
