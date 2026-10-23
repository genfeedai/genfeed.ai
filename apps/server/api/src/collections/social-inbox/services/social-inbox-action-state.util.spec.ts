import type { SocialInboxOutboundWorkflowState } from '@api/collections/social-inbox/services/social-inbox-action.service';
import {
  buildActionProvenance,
  buildConversationUpdate,
  readOutboundState,
  requireOutboundString,
  toOutboundScope,
  toSocialActionInput,
} from '@api/collections/social-inbox/services/social-inbox-action-state.util';
import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    body: 'Reply body',
    conversationId: 'conversation-one',
    organizationId: 'organization-one',
    ...overrides,
  };
}

describe('outbound workflow state', () => {
  it('defaults a request to a reply while preserving extra workflow data', () => {
    const request = makeRequest({ action: 'send_dm', traceId: 'trace-one' });
    const state: SocialInboxOutboundWorkflowState = readOutboundState({
      request,
    });

    expect(state).toEqual({
      ...request,
      action: 'post_reply',
      messageType: 'reply',
    });
    expect(request).not.toHaveProperty('messageType');
  });

  it('uses a nonempty state ahead of request and derives the DM action', () => {
    const state = makeRequest({
      action: 'post_reply',
      messageType: 'dm',
      outboundMessageId: 'outbound-one',
      reservationClaimed: false,
    });

    expect(
      readOutboundState({ request: makeRequest({ body: 'Ignored' }), state }),
    ).toEqual({
      ...state,
      action: 'send_dm',
    });
  });

  it.each([
    { state: undefined },
    { state: null },
    { state: [] },
    { state: 'invalid' },
    { state: 7 },
    { state: false },
    { state: {} },
  ])(
    'falls back to request for empty or non-record state $state',
    ({ state }) => {
      expect(
        readOutboundState({ request: makeRequest(), state }),
      ).toMatchObject({
        action: 'post_reply',
        body: 'Reply body',
        conversationId: 'conversation-one',
        organizationId: 'organization-one',
      });
    },
  );

  it('does not hide a malformed nonempty state behind a valid request', () => {
    expect(() =>
      readOutboundState({
        request: makeRequest(),
        state: { traceId: 'trace' },
      }),
    ).toThrow('Social inbox outbound action requires body');
  });

  it('returns a terminal outcome by identity without requiring request fields', () => {
    const state = { error: 'Already handled', outcome: 'skipped' };
    expect(readOutboundState({ state })).toBe(state);
  });

  it('still validates fields when an outcome is falsy', () => {
    expect(() => readOutboundState({ state: { outcome: '' } })).toThrow(
      'Social inbox outbound action requires body',
    );
  });

  it.each(['body', 'conversationId', 'organizationId'])(
    'retains the field-specific validation error for %s',
    (field) => {
      expect(() =>
        readOutboundState({ request: makeRequest({ [field]: '' }) }),
      ).toThrow(`Social inbox outbound action requires ${field}`);
    },
  );

  it('preserves whitespace in nonempty bodies and defaults unknown message types to reply', () => {
    expect(
      readOutboundState({
        request: makeRequest({ body: '  ', messageType: 'comment' }),
      }),
    ).toMatchObject({
      action: 'post_reply',
      body: '  ',
      messageType: 'reply',
    });
  });

  it.each([undefined, null, '', 0, false, {}, []])(
    'rejects a missing string value %s',
    (value) => {
      expect(() => requireOutboundString(value, 'outboundMessageId')).toThrow(
        'Social inbox outbound action requires outboundMessageId',
      );
    },
  );

  it('keeps nonempty string values intact', () => {
    expect(requireOutboundString('  message-one  ', 'outboundMessageId')).toBe(
      '  message-one  ',
    );
  });

  it('projects only organization and actor into the query scope', () => {
    const state = readOutboundState({
      request: makeRequest({ brandId: 'brand-one', userId: 'opaque-user' }),
    });
    expect(toOutboundScope(state)).toEqual({
      organizationId: 'organization-one',
      userId: 'opaque-user',
    });
  });

  it('preserves optional absence in scope and social-action input', () => {
    const state = readOutboundState({ request: makeRequest() });
    expect(toOutboundScope(state)).toEqual({
      organizationId: 'organization-one',
      userId: undefined,
    });
    expect(toSocialActionInput(state)).toEqual({
      idempotencyKey: undefined,
      messageType: 'reply',
      recipientId: undefined,
      text: 'Reply body',
      workflowRunId: undefined,
    });
  });

  it('carries retry and recipient identity into social-action input without extra state', () => {
    const state = readOutboundState({
      request: makeRequest({
        externalMessageId: 'provider-one',
        idempotencyKey: 'key-one',
        messageType: 'dm',
        recipientId: 'recipient-one',
        workflowRunId: 'run-one',
      }),
    });
    expect(toSocialActionInput(state)).toEqual({
      idempotencyKey: 'key-one',
      messageType: 'dm',
      recipientId: 'recipient-one',
      text: 'Reply body',
      workflowRunId: 'run-one',
    });
  });
});

describe('action provenance', () => {
  const now = new Date('2026-10-23T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    { userId: undefined, workflowRunId: undefined, actorType: 'system' },
    { userId: 'opaque-user', workflowRunId: undefined, actorType: 'user' },
    { userId: undefined, workflowRunId: 'run-one', actorType: 'workflow' },
    { userId: 'opaque-user', workflowRunId: 'run-one', actorType: 'workflow' },
    { userId: 'opaque-user', workflowRunId: '', actorType: 'user' },
    { userId: '', workflowRunId: undefined, actorType: 'system' },
  ])(
    'records the $actorType actor with workflow precedence',
    ({ userId, workflowRunId, actorType }) => {
      expect(
        buildActionProvenance({
          action: 'post_reply',
          conversation: { platform: 'twitter' },
          input: { text: 'Reply body', workflowRunId },
          scope: { organizationId: 'organization-one', userId },
          status: 'pending',
        }),
      ).toEqual({
        action: 'post_reply',
        actedAt: now.toISOString(),
        actorType,
        platform: 'twitter',
        status: 'pending',
        userId,
        workflowRunId,
      });
    },
  );
});

describe('conversation update projection', () => {
  it.each([
    { status: 'needs_review', needsReview: true, isReadThrough: false },
    { status: 'resolved', needsReview: false, isReadThrough: true },
    { status: 'archived', needsReview: false, isReadThrough: true },
    { status: 'open', needsReview: false, isReadThrough: false },
    { status: 'custom', needsReview: false, isReadThrough: false },
    { status: '', needsReview: false, isReadThrough: false },
  ])(
    'preserves status/review/read-through behavior for $status',
    ({ status, needsReview, isReadThrough }) => {
      expect(buildConversationUpdate({ status })).toEqual({
        data: { needsReview, status },
        isReadThrough,
      });
    },
  );

  it('trims and deduplicates tags while retaining case and insertion order', () => {
    const tags = [' one ', '', 'one', 'One', ' two ', '   '];
    expect(buildConversationUpdate({ tags })).toEqual({
      data: { tags: ['one', 'One', 'two'] },
      isReadThrough: false,
    });
    expect(tags).toEqual([' one ', '', 'one', 'One', ' two ', '   ']);
  });

  it('caps distinct tags at twenty after deduplication', () => {
    const tags = [
      'tag-0',
      ...Array.from({ length: 25 }, (_, index) => `tag-${index}`),
    ];
    expect(buildConversationUpdate({ tags }).data.tags).toEqual(
      Array.from({ length: 20 }, (_, index) => `tag-${index}`),
    );
  });

  it.each([null, '', 'owner-one'])(
    'preserves explicit owner assignment %s',
    (assignedOwnerId) => {
      expect(buildConversationUpdate({ assignedOwnerId })).toEqual({
        data: { assignedOwnerId },
        isReadThrough: false,
      });
    },
  );

  it('allows clearing tags and leaves an omitted owner untouched', () => {
    expect(
      buildConversationUpdate({ assignedOwnerId: undefined, tags: [] }),
    ).toEqual({
      data: { tags: [] },
      isReadThrough: false,
    });
  });

  it('combines all supplied fields without changing the input', () => {
    const patch = {
      assignedOwnerId: 'owner-one',
      status: 'archived',
      tags: [' topic '],
    };
    expect(buildConversationUpdate(patch)).toEqual({
      data: {
        assignedOwnerId: 'owner-one',
        needsReview: false,
        status: 'archived',
        tags: ['topic'],
      },
      isReadThrough: true,
    });
    expect(patch.tags).toEqual([' topic ']);
  });

  it.each([
    {},
    { assignedOwnerId: undefined, status: undefined, tags: undefined },
  ])(
    'retains the bad-request category and message for an empty patch',
    (patch) => {
      expect(() => buildConversationUpdate(patch)).toThrow(BadRequestException);
      expect(() => buildConversationUpdate(patch)).toThrow(
        'No conversation fields to update',
      );
    },
  );
});
