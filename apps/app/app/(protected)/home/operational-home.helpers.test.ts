import { TargetExecutionState } from '@genfeedai/contracts';
import { API_KEY_SCOPE_PRESETS } from '@genfeedai/contracts/constants';
import type {
  IActivity,
  ICredential,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { ApiKey } from '@genfeedai/models/auth/api-key.model';
import { describe, expect, it } from 'vitest';
import {
  getActivityBadge,
  getCredentialBadge,
  getVerifiedMcpConnection,
  summarizeCredentialHealth,
  summarizeUpcomingSchedule,
} from './operational-home.helpers';

const NOW = Date.parse('2026-07-26T12:00:00.000Z');

function createVerifiedKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return new ApiKey({
    createdAt: '2026-07-25T12:00:00.000Z',
    id: 'key_1',
    isActive: true,
    isRevoked: false,
    label: 'Verified MCP',
    metadata: {
      connectGenfeed: {
        lastVerifiedAt: '2026-07-26T11:00:00.000Z',
        transport: 'streamable-http',
      },
    },
    organization: 'org_1',
    scopes: [...API_KEY_SCOPE_PRESETS.mcp],
    updatedAt: '2026-07-26T11:00:00.000Z',
    ...overrides,
  });
}

describe('getVerifiedMcpConnection', () => {
  it('accepts an active verified MCP key', () => {
    const result = getVerifiedMcpConnection(
      [createVerifiedKey()],
      'org_1',
      NOW,
    );

    expect(result?.apiKey.id).toBe('key_1');
    expect(result?.verifiedAt).toBe('2026-07-26T11:00:00.000Z');
  });

  it.each([
    ['inactive', { isActive: false }],
    ['revoked', { isRevoked: true }],
    ['expired', { expiresAt: '2026-07-26T10:00:00.000Z' }],
    ['wrong scope', { scopes: ['brands:read'] }],
    ['wrong organization', { organization: 'org_2' }],
    ['missing organization', { organization: undefined }],
    ['missing metadata', { metadata: {} }],
    [
      'wrong transport',
      {
        metadata: {
          connectGenfeed: {
            lastVerifiedAt: '2026-07-26T11:00:00.000Z',
            transport: 'stdio',
          },
        },
      },
    ],
    [
      'malformed timestamp',
      {
        metadata: {
          connectGenfeed: {
            lastVerifiedAt: 'not-a-date',
            transport: 'streamable-http',
          },
        },
      },
    ],
    [
      'verification older than the key',
      {
        metadata: {
          connectGenfeed: {
            lastVerifiedAt: '2026-07-24T11:00:00.000Z',
            transport: 'streamable-http',
          },
        },
      },
    ],
    [
      'future verification',
      {
        metadata: {
          connectGenfeed: {
            lastVerifiedAt: '2026-07-26T13:00:00.000Z',
            transport: 'streamable-http',
          },
        },
      },
    ],
  ])('rejects a %s key', (_label, overrides) => {
    expect(
      getVerifiedMcpConnection(
        [createVerifiedKey(overrides as Partial<ApiKey>)],
        'org_1',
        NOW,
      ),
    ).toBeNull();
  });
});

describe('getCredentialBadge', () => {
  it.each([
    [
      'disconnected',
      { isConnected: false },
      { label: 'Disconnected', variant: 'destructive' },
    ],
    [
      'publishing hold',
      { accountHealth: { holdPublishing: true }, isConnected: true },
      { label: 'Needs attention', variant: 'warning' },
    ],
    [
      'high risk',
      { accountHealth: { riskLevel: 'high' }, isConnected: true },
      { label: 'Needs attention', variant: 'warning' },
    ],
    [
      'healthy',
      { accountHealth: { state: 'healthy' }, isConnected: true },
      { label: 'Healthy', variant: 'success' },
    ],
    [
      'low risk',
      { accountHealth: { riskLevel: 'low' }, isConnected: true },
      { label: 'Healthy', variant: 'success' },
    ],
    ['unknown', { isConnected: true }, { label: 'Connected', variant: 'info' }],
  ])('maps %s credentials', (_label, credential, expected) => {
    expect(getCredentialBadge(credential as unknown as ICredential)).toEqual(
      expected,
    );
  });
});

describe('getActivityBadge', () => {
  it.each([
    [
      'failed',
      { status: 'failed' },
      { label: 'Failed', variant: 'destructive' },
    ],
    [
      'processing',
      { value: 'processing' },
      { label: 'In progress', variant: 'warning' },
    ],
    [
      'published',
      { status: 'published' },
      { label: 'Completed', variant: 'success' },
    ],
    [
      'key-generated',
      { key: 'image-generated' },
      { label: 'Completed', variant: 'success' },
    ],
    [
      'key-failed',
      { key: 'video-failed' },
      { label: 'Failed', variant: 'destructive' },
    ],
    ['unknown', {}, { label: 'Recorded', variant: 'info' }],
  ])('maps %s activity', (_label, activity, expected) => {
    expect(getActivityBadge(activity as unknown as IActivity)).toEqual(
      expected,
    );
  });
});

describe('summarizeUpcomingSchedule', () => {
  const windowStart = new Date('2026-07-26T00:00:00.000Z');

  function releaseWith(
    targets: Array<{
      executionState?: TargetExecutionState;
      scheduledAt?: string | null;
    }>,
    scheduledAt: string | null = null,
  ): IReleaseGroup {
    return {
      id: 'release-1',
      scheduledAt,
      targets: targets.map((target, index) => ({
        executionState: TargetExecutionState.SCHEDULED,
        id: `target-${index}`,
        ...target,
      })),
    } as unknown as IReleaseGroup;
  }

  it('buckets scheduled targets into their local calendar day', () => {
    const days = summarizeUpcomingSchedule(
      [
        releaseWith([
          { scheduledAt: '2026-07-26T09:00:00.000Z' },
          { scheduledAt: '2026-07-26T18:00:00.000Z' },
          { scheduledAt: '2026-07-28T08:00:00.000Z' },
        ]),
      ],
      windowStart,
    );

    expect(days).toHaveLength(7);
    expect(days.map((day) => day.count)).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(days[0]?.date.getTime()).toBe(windowStart.getTime());
  });

  it('counts only targets that are still scheduled', () => {
    const days = summarizeUpcomingSchedule(
      [
        releaseWith([
          {
            executionState: TargetExecutionState.PUBLISHED,
            scheduledAt: '2026-07-26T09:00:00.000Z',
          },
          {
            executionState: TargetExecutionState.FAILED,
            scheduledAt: '2026-07-26T10:00:00.000Z',
          },
          { scheduledAt: '2026-07-26T11:00:00.000Z' },
        ]),
      ],
      windowStart,
    );

    expect(days[0]?.count).toBe(1);
  });

  it('falls back to the release instant for targets without their own', () => {
    const days = summarizeUpcomingSchedule(
      [releaseWith([{}, {}], '2026-07-27T09:00:00.000Z')],
      windowStart,
    );

    expect(days.map((day) => day.count)).toEqual([0, 2, 0, 0, 0, 0, 0]);
  });

  it('ignores targets outside the window and without any instant', () => {
    const days = summarizeUpcomingSchedule(
      [
        releaseWith([
          { scheduledAt: '2026-07-25T23:59:00.000Z' },
          { scheduledAt: '2026-08-02T00:00:00.000Z' },
          {},
        ]),
      ],
      windowStart,
    );

    expect(days.every((day) => day.count === 0)).toBe(true);
  });
});

describe('summarizeCredentialHealth', () => {
  it('separates healthy, unknown, and attention states', () => {
    const credentials = [
      {
        id: 'healthy',
        isConnected: true,
        accountHealth: { riskLevel: 'low', state: 'healthy' },
      },
      {
        id: 'unknown',
        isConnected: true,
      },
      {
        id: 'blocked',
        isConnected: true,
        accountHealth: { holdPublishing: true, riskLevel: 'high' },
      },
      {
        id: 'disconnected',
        isConnected: false,
      },
    ] as unknown as ICredential[];

    expect(summarizeCredentialHealth(credentials)).toEqual({
      attention: 2,
      healthy: 1,
      total: 4,
      unknown: 1,
    });
  });

  it('handles an empty credential list', () => {
    expect(summarizeCredentialHealth([])).toEqual({
      attention: 0,
      healthy: 0,
      total: 0,
      unknown: 0,
    });
  });
});
