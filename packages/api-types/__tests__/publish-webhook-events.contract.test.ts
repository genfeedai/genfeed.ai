import {
  classifyPublishWebhookError,
  createPublishWebhookEventId,
  createSamplePublishWebhookPayload,
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

  test('accepts a classified target failure payload snapshot', () => {
    const result = publishWebhookPayloadSchema.safeParse({
      event: 'target.failed',
      eventId: 'publish:target.failed:release_123:target_123:failed',
      occurredAt: '2026-07-07T10:00:00.000Z',
      release: {
        id: 'release_123',
        publishedAt: null,
        scheduledAt: '2026-07-07T09:55:00.000Z',
        status: ReleaseStatus.FAILED,
        targetSummary: {
          failed: 1,
          published: 0,
          total: 1,
        },
      },
      schemaVersion: PUBLISH_WEBHOOK_SCHEMA_VERSION,
      target: {
        ...target,
        error: {
          class: 'credential',
          code: 'credential',
          message: 'Credential expired',
          retryable: false,
        },
        publishedAt: null,
        status: TargetExecutionState.FAILED,
      },
      timestamp: '2026-07-07T10:00:00.000Z',
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected target failure payload to parse');
    }
    expect(result.data).toMatchInlineSnapshot(`
      {
        "event": "target.failed",
        "eventId": "publish:target.failed:release_123:target_123:failed",
        "occurredAt": "2026-07-07T10:00:00.000Z",
        "release": {
          "id": "release_123",
          "publishedAt": null,
          "scheduledAt": "2026-07-07T09:55:00.000Z",
          "status": "failed",
          "targetSummary": {
            "failed": 1,
            "published": 0,
            "total": 1,
          },
        },
        "schemaVersion": 1,
        "target": {
          "credential": {
            "id": "cred_123",
          },
          "error": {
            "class": "credential",
            "code": "credential",
            "message": "Credential expired",
            "retryable": false,
          },
          "externalProviderId": "post_123",
          "externalShortcode": "abc123",
          "id": "target_123",
          "platform": "twitter",
          "publishedAt": null,
          "scheduledAt": "2026-07-07T09:55:00.000Z",
          "status": "failed",
          "url": "https://x.com/example/status/post_123",
        },
        "timestamp": "2026-07-07T10:00:00.000Z",
      }
    `);
  });
});

describe('publish webhook helpers', () => {
  test('builds a schema-valid sample payload for test delivery', () => {
    const payload = createSamplePublishWebhookPayload({
      event: 'release.partially_published',
      occurredAt: '2026-07-07T10:00:00.000Z',
    });

    expect(payload.event).toBe('release.partially_published');
    expect(payload.targets).toHaveLength(2);
    expect(publishWebhookPayloadSchema.safeParse(payload).success).toBe(true);
  });

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

  test.each([
    ['missing channel configuration', 'misconfiguration'],
    ['credential token expired', 'credential'],
    ['provider timeout with 503', 'provider_outage'],
    ['quota exceeded', 'rate_limit'],
    ['unsupported platform', 'validation'],
    ['unexpected scheduler failure', 'unknown'],
  ] as const)('classifies "%s" as %s', (message, expectedErrorClass) => {
    expect(classifyPublishWebhookError(message)).toBe(expectedErrorClass);
  });

  test('redacts secret-like text from error messages', () => {
    expect(
      redactPublishWebhookText(
        'Provider failed with access_token=abc123, oauth_token=oauth987, token=bare123, id_token=id456, session_token=session789, signature=signed123, Bearer xyz987, and Basic dXNlcjpwYXNz',
      ),
    ).toBe(
      'Provider failed with access_token=[REDACTED], oauth_token=[REDACTED], token=[REDACTED], id_token=[REDACTED], session_token=[REDACTED], signature=[REDACTED], Bearer [REDACTED], and Basic [REDACTED]',
    );
  });
});
