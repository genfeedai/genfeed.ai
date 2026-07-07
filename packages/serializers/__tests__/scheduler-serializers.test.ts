import { channelTargetSerializerConfig } from '@serializers/configs/content/channel-target.config';
import { recurrenceRuleSerializerConfig } from '@serializers/configs/content/recurrence-rule.config';
import { releaseAttachmentSerializerConfig } from '@serializers/configs/content/release-attachment.config';
import { releaseGroupSerializerConfig } from '@serializers/configs/content/release-group.config';
import { ChannelTargetSerializer } from '@serializers/server/content/channel-target.serializer';
import { RecurrenceRuleSerializer } from '@serializers/server/content/recurrence-rule.serializer';
import { ReleaseAttachmentSerializer } from '@serializers/server/content/release-attachment.serializer';
import { ReleaseGroupSerializer } from '@serializers/server/content/release-group.serializer';
import { Serializer } from 'ts-jsonapi';

describe('Scheduler serializer configs', () => {
  test('release group config wires owner/org/brand and nested targets', () => {
    expect(releaseGroupSerializerConfig).toHaveProperty(
      'type',
      'release-group',
    );
    expect(releaseGroupSerializerConfig).toHaveProperty('owner');
    expect(releaseGroupSerializerConfig).toHaveProperty('organization');
    expect(releaseGroupSerializerConfig).toHaveProperty('brand');
    expect(releaseGroupSerializerConfig.targets).toHaveProperty(
      'type',
      'channel-target',
    );
    // Nested credential relationship on each target.
    expect(releaseGroupSerializerConfig.targets).toHaveProperty('credential');
    expect(releaseGroupSerializerConfig.recurrence).toHaveProperty(
      'type',
      'recurrence-rule',
    );
  });

  test('channel target config wires credential + attachments relationships', () => {
    expect(channelTargetSerializerConfig).toHaveProperty(
      'type',
      'channel-target',
    );
    expect(channelTargetSerializerConfig.credential).toHaveProperty(
      'type',
      'credential',
    );
    expect(channelTargetSerializerConfig.attachments).toHaveProperty(
      'type',
      'release-attachment',
    );
  });

  test('recurrence + attachment configs expose their attribute sets', () => {
    expect(recurrenceRuleSerializerConfig).toHaveProperty(
      'type',
      'recurrence-rule',
    );
    expect(recurrenceRuleSerializerConfig.attributes).toContain('frequency');
    expect(recurrenceRuleSerializerConfig.attributes).toContain('nextRunAt');

    expect(releaseAttachmentSerializerConfig).toHaveProperty(
      'type',
      'release-attachment',
    );
    expect(releaseAttachmentSerializerConfig.attributes).toContain('kind');
    expect(releaseAttachmentSerializerConfig.attributes).toContain('body');
  });
});

describe('Built server serializers', () => {
  test('all scheduler serializers are constructed', () => {
    expect(ReleaseGroupSerializer).toBeInstanceOf(Serializer);
    expect(ChannelTargetSerializer).toBeInstanceOf(Serializer);
    expect(RecurrenceRuleSerializer).toBeInstanceOf(Serializer);
    expect(ReleaseAttachmentSerializer).toBeInstanceOf(Serializer);
  });
});

describe('Release group serialization', () => {
  test('serializes a partially-published release with mixed target states', () => {
    const result = ReleaseGroupSerializer.serialize({
      id: 'rel_1',
      baseContent: 'Launch day is here.',
      idempotencyKey: 'idem-1',
      status: 'partially-published',
      targetSummary: { failed: 1, published: 1, total: 2 },
      timezone: 'Europe/Amsterdam',
      title: 'Launch',
      targets: [
        {
          id: 'tgt_1',
          executionState: 'published',
          externalProviderId: 'tw_1',
          platform: 'twitter',
        },
        {
          id: 'tgt_2',
          error: { code: 'rate_limited', isRetryable: true },
          executionState: 'failed',
          platform: 'linkedin',
        },
      ],
    });

    expect(result.data).toHaveProperty('type', 'release-group');
    expect(result.data).toHaveProperty('id', 'rel_1');
    expect(result.data.attributes).toHaveProperty('title', 'Launch');
    expect(result.data.attributes).toHaveProperty(
      'status',
      'partially-published',
    );
    // IANA timezone must survive serialization untouched (no offset coercion).
    expect(result.data.attributes).toHaveProperty(
      'timezone',
      'Europe/Amsterdam',
    );
    expect(result.data.attributes.targetSummary).toEqual({
      failed: 1,
      published: 1,
      total: 2,
    });
    expect(result.data.relationships).toHaveProperty('targets');
  });
});

describe('Channel target serialization', () => {
  test.each([
    ['scheduled'],
    ['publishing'],
    ['published'],
    ['failed'],
    ['cancelled'],
    ['skipped'],
  ])('serializes a target in "%s" execution state', (executionState) => {
    const result = ChannelTargetSerializer.serialize({
      id: `tgt_${executionState}`,
      executionState,
      platform: 'twitter',
      timezone: 'America/New_York',
      validationState: 'valid',
    });

    expect(result.data).toHaveProperty('type', 'channel-target');
    expect(result.data.attributes).toHaveProperty(
      'executionState',
      executionState,
    );
    expect(result.data.attributes).toHaveProperty(
      'timezone',
      'America/New_York',
    );
  });

  test('serializes provider ids and structured error detail', () => {
    const result = ChannelTargetSerializer.serialize({
      id: 'tgt_err',
      error: {
        code: 'permission_denied',
        isRetryable: false,
        message: 'Missing scope',
      },
      executionState: 'failed',
      externalProviderId: 'li_999',
      externalShortcode: 'abc',
      retryCount: 3,
    });

    expect(result.data.attributes).toHaveProperty(
      'externalProviderId',
      'li_999',
    );
    expect(result.data.attributes).toHaveProperty('retryCount', 3);
    expect(result.data.attributes.error).toMatchObject({
      code: 'permission_denied',
      isRetryable: false,
    });
  });

  test('serializes sanitized provider readiness for scheduling surfaces', () => {
    const result = ChannelTargetSerializer.serialize({
      id: 'tgt_ready',
      executionState: 'scheduled',
      platform: 'instagram',
      readiness: {
        appReviewStatus: 'fail',
        callbackUrlStatus: 'pass',
        canSchedule: false,
        diagnostics: [
          {
            classification: 'missing_provider_approval',
            code: 'meta_app_review_required',
            correctiveAction: 'Move the Meta app out of development mode.',
            details: { appMode: 'development' },
            isRetryable: false,
            message: 'Meta app review is required before publishing.',
            severity: 'error',
          },
        ],
        isRetryable: false,
        permissionScopeStatus: 'pass',
        providerKey: 'instagram',
        quotaStatus: 'unknown',
        requiredAction: 'Move the Meta app out of development mode.',
        state: 'blocked',
        tokenFreshness: 'pass',
      },
    });

    expect(result.data.attributes.readiness).toMatchObject({
      appReviewStatus: 'fail',
      canSchedule: false,
      providerKey: 'instagram',
      state: 'blocked',
    });
    expect(result.data.attributes.readiness.diagnostics[0]).toMatchObject({
      classification: 'missing_provider_approval',
      code: 'meta_app_review_required',
    });
  });
});

describe('Recurrence + attachment serialization', () => {
  test('serializes a recurrence rule with DST-safe fields', () => {
    const result = RecurrenceRuleSerializer.serialize({
      id: 'rec_1',
      frequency: 'weekly',
      interval: 1,
      nextRunAt: '2026-08-08T09:00:00Z',
      parentReleaseId: 'rel_1',
      repeatCount: 2,
      weekdays: [1, 3, 5],
    });

    expect(result.data).toHaveProperty('type', 'recurrence-rule');
    expect(result.data.attributes).toHaveProperty('frequency', 'weekly');
    expect(result.data.attributes.weekdays).toEqual([1, 3, 5]);
    expect(result.data.attributes).toHaveProperty('parentReleaseId', 'rel_1');
  });

  test('serializes a per-platform signature attachment', () => {
    const result = ReleaseAttachmentSerializer.serialize({
      id: 'att_1',
      body: '— Sent from Genfeed',
      kind: 'signature',
      order: 0,
      platform: 'linkedin',
      releaseId: 'rel_1',
    });

    expect(result.data).toHaveProperty('type', 'release-attachment');
    expect(result.data.attributes).toHaveProperty('kind', 'signature');
    expect(result.data.attributes).toHaveProperty('platform', 'linkedin');
  });
});
