import type { AccountHealthSummary } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import { buildAccountHealthRows } from './account-health.util';

function buildAccountHealth(
  overrides: Partial<AccountHealthSummary> = {},
): AccountHealthSummary {
  return {
    credentialId: 'credential-1',
    handle: '@studio',
    holdPublishing: false,
    label: 'Studio Instagram',
    override: { isActive: false },
    platform: 'instagram' as AccountHealthSummary['platform'],
    riskLevel: 'low',
    score: 90,
    signals: {
      connectedDays: 30,
      profileSignals: 3,
      publishedPosts: 10,
      recentFailures: 0,
    },
    state: 'healthy',
    thresholds: {
      maxRecentFailures: 3,
      minConnectedDays: 7,
      minProfileSignals: 1,
      minPublishedPosts: 1,
    },
    ...overrides,
  };
}

describe('buildAccountHealthRows', () => {
  it('projects health fields and prefers the handle as the account label', () => {
    const rows = buildAccountHealthRows([buildAccountHealth()]);

    expect(rows).toEqual([
      {
        accountLabel: '@studio',
        connectedDays: 30,
        credentialId: 'credential-1',
        holdPublishing: false,
        holdReason: undefined,
        needsReconnect: false,
        platform: 'instagram',
        publishedPosts: 10,
        recentFailures: 0,
        riskLevel: 'low',
        score: 90,
        state: 'healthy',
      },
    ]);
  });

  it('orders reconnect, hold, and high-risk accounts ahead of healthy ones', () => {
    const rows = buildAccountHealthRows([
      buildAccountHealth({
        credentialId: 'healthy',
        handle: '@ok',
        score: 95,
      }),
      buildAccountHealth({
        credentialId: 'held',
        handle: '@held',
        holdPublishing: true,
        holdReason: 'warmup',
        score: 40,
        state: 'warming',
      }),
      buildAccountHealth({
        credentialId: 'expired',
        handle: '@old',
        reconnect: {
          credentialId: 'expired',
          isAvailable: true,
          reason: 'disconnected',
        },
        riskLevel: 'high',
        score: 10,
        state: 'risky',
      }),
    ]);

    expect(rows.map((row) => row.credentialId)).toEqual([
      'expired',
      'held',
      'healthy',
    ]);
  });
});
