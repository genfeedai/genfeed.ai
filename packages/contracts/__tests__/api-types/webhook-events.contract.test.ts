import { describe, expect, test } from 'vitest';
import { createSampleGenerationWebhookPayload } from '../../src/api-types/contracts/generation-webhook-events.contract';
import { createSamplePublishWebhookPayload } from '../../src/api-types/contracts/publish-webhook-events.contract';
import {
  isOrganizationWebhookEventEnabled,
  isOrganizationWebhookEventType,
  ORGANIZATION_WEBHOOK_EVENT_TYPES,
  organizationWebhookPayloadSchema,
} from '../../src/api-types/contracts/webhook-events.contract';
import { createSampleWorkflowWebhookPayload } from '../../src/api-types/contracts/workflow-webhook-events.contract';

describe('ORGANIZATION_WEBHOOK_EVENT_TYPES', () => {
  test('carries the publish, generation, and workflow families exactly once', () => {
    expect([...ORGANIZATION_WEBHOOK_EVENT_TYPES]).toEqual([
      'release.published',
      'release.partially_published',
      'release.failed',
      'target.published',
      'target.failed',
      'generation.completed',
      'generation.failed',
      'workflow.execution.completed',
      'workflow.execution.failed',
    ]);
    expect(new Set(ORGANIZATION_WEBHOOK_EVENT_TYPES).size).toBe(
      ORGANIZATION_WEBHOOK_EVENT_TYPES.length,
    );
  });

  test.each(ORGANIZATION_WEBHOOK_EVENT_TYPES)(
    'recognizes %s as a catalog event',
    (event) => {
      expect(isOrganizationWebhookEventType(event)).toBe(true);
    },
  );

  test.each([
    'generation.started',
    'workflow.execution.cancelled',
    '',
    null,
    42,
  ])('rejects %s as a catalog event', (value) => {
    expect(isOrganizationWebhookEventType(value)).toBe(false);
  });
});

describe('organizationWebhookPayloadSchema', () => {
  test.each([
    createSamplePublishWebhookPayload({ event: 'target.published' }),
    createSampleGenerationWebhookPayload({ event: 'generation.failed' }),
    createSampleWorkflowWebhookPayload({
      event: 'workflow.execution.completed',
    }),
  ])('accepts the $event sample payload', (payload) => {
    expect(organizationWebhookPayloadSchema.safeParse(payload).success).toBe(
      true,
    );
  });

  test('rejects a payload outside every family', () => {
    expect(
      organizationWebhookPayloadSchema.safeParse({
        event: 'generation.started',
        eventId: 'generation:generation.started:image:ingredient_1:started',
        occurredAt: '2026-07-07T10:00:00.000Z',
        schemaVersion: 1,
        timestamp: '2026-07-07T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('isOrganizationWebhookEventEnabled', () => {
  test.each(ORGANIZATION_WEBHOOK_EVENT_TYPES)(
    'delivers %s when no filter is configured',
    (event) => {
      expect(isOrganizationWebhookEventEnabled([], event)).toBe(true);
    },
  );

  test('narrows delivery to the configured events', () => {
    const configured = ['generation.completed', 'workflow.execution.failed'];

    expect(
      isOrganizationWebhookEventEnabled(configured, 'generation.completed'),
    ).toBe(true);
    expect(
      isOrganizationWebhookEventEnabled(
        configured,
        'workflow.execution.failed',
      ),
    ).toBe(true);
    expect(
      isOrganizationWebhookEventEnabled(configured, 'target.published'),
    ).toBe(false);
  });

  test('drops unknown filter values instead of treating them as a match', () => {
    const configured = ['generation.started', 'generation.completed'];

    expect(
      isOrganizationWebhookEventEnabled(configured, 'generation.completed'),
    ).toBe(true);
    expect(
      isOrganizationWebhookEventEnabled(configured, 'generation.failed'),
    ).toBe(false);
  });

  test('treats an all-unknown filter as no filter at all', () => {
    expect(
      isOrganizationWebhookEventEnabled(
        ['generation.started'],
        'workflow.execution.completed',
      ),
    ).toBe(true);
  });
});
