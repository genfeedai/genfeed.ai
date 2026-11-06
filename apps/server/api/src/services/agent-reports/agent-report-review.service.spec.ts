import type { AgentReportAccessService } from '@api/services/agent-reports/agent-report-access.service';
import {
  type AgentReportReviewToken,
  agentReportTokenKey,
} from '@api/services/agent-reports/agent-report-binding';
import { AgentReportReviewService } from '@api/services/agent-reports/agent-report-review.service';
import type { CacheService } from '@api/services/cache/cache.service';
import type { TurboRunReviewService } from '@api/services/turbo-run/turbo-run-review.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it } from 'vitest';

type ReviewDecision = {
  decision: 'approve' | 'reject';
  expected: Record<string, string>;
  itemIds: string[];
  organizationId: string;
  reviewerId: string;
  turboRunId: string;
};

const receipt: AgentReportReviewToken = {
  organizationId: 'org',
  integrationId: 'integration',
  platform: 'telegram',
  binding: {
    enabled: true,
    brandId: 'brand',
    userId: 'canonical-user',
    remoteUserId: 'remote',
    channelId: 'chat',
  },
  strategyId: 'strategy',
  turboRunId: 'turboRun',
  itemId: 'item',
  postId: 'post',
  postVersion: '2026-09-24T10:00:00.000Z',
};
const TOKEN = 'a'.repeat(32);

/**
 * In-memory review-token cache, integration bindings, reviewer access and
 * review queue. `decisions` is what reached the review queue.
 */
function fixture() {
  const tokens = new Map<string, AgentReportReviewToken>([
    [agentReportTokenKey(TOKEN), receipt],
  ]);
  const integration = { bindings: [receipt.binding] };
  const reviewers = new Set(['canonical-user']);
  const decisions: ReviewDecision[] = [];
  const cache = {
    get: async (key: string) => tokens.get(key) ?? null,
    getdel: async (key: string) => {
      const value = tokens.get(key) ?? null;
      tokens.delete(key);
      return value;
    },
  };
  const prisma = {
    agentStrategy: { findFirst: async () => ({ id: 'strategy' }) },
    orgIntegration: {
      findFirst: async () => ({
        config: { agentReportBindings: integration.bindings },
      }),
    },
  };
  const access = {
    canReview: async (_organizationId: string, userId: string) =>
      reviewers.has(userId),
  };
  const review = {
    approveItems: async (
      turboRunId: string,
      itemIds: string[],
      organizationId: string,
      reviewerId: string,
      _isDirectPublish: boolean,
      expected: Record<string, string>,
    ) => {
      decisions.push({
        decision: 'approve',
        expected,
        itemIds,
        organizationId,
        reviewerId,
        turboRunId,
      });
    },
    rejectItems: async (
      turboRunId: string,
      itemIds: string[],
      organizationId: string,
      _reason: string,
      reviewerId: string,
      expected: Record<string, string>,
    ) => {
      decisions.push({
        decision: 'reject',
        expected,
        itemIds,
        organizationId,
        reviewerId,
        turboRunId,
      });
    },
  };
  const service = new AgentReportReviewService(
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
    access as unknown as AgentReportAccessService,
    review as unknown as TurboRunReviewService,
  );
  return {
    decisions,
    input: {
      organizationId: 'org',
      remoteUserId: 'remote',
      channelId: 'chat',
      token: TOKEN,
      decision: 'approve' as const,
    },
    integration,
    reviewers,
    service,
    isTokenUnused: () => tokens.has(agentReportTokenKey(TOKEN)),
  };
}

const boundDecision = (decision: 'approve' | 'reject'): ReviewDecision => ({
  decision,
  expected: { post: receipt.postVersion },
  itemIds: ['item'],
  organizationId: 'org',
  reviewerId: 'canonical-user',
  turboRunId: 'turboRun',
});

describe('bound agent report review', () => {
  it('uses canonical bound user and the original post version in normal review, consuming one token', async () => {
    const f = fixture();
    // A double tap: both callbacks read the token before either claims it.
    const [approve, reject] = await Promise.allSettled([
      f.service.resolve('telegram', f.input),
      f.service.resolve('telegram', { ...f.input, decision: 'reject' }),
    ]);
    expect(approve).toEqual({
      status: 'fulfilled',
      value: {
        message: 'Draft approved through the review queue.',
        success: true,
      },
    });
    expect(reject).toMatchObject({
      reason: expect.objectContaining({
        message: expect.stringContaining('already used'),
      }),
      status: 'rejected',
    });
    expect(f.decisions).toEqual([boundDecision('approve')]);
    expect(f.isTokenUnused()).toBe(false);
  });

  it.each([
    { organizationId: 'foreign' },
    { remoteUserId: 'intruder' },
    { channelId: 'foreign' },
  ])(
    'denies mismatched callback context %j before consuming token',
    async (change) => {
      const f = fixture();
      await expect(
        f.service.resolve('telegram', { ...f.input, ...change }),
      ).rejects.toThrow('unavailable');
      expect(f.isTokenUnused()).toBe(true);
      expect(f.decisions).toEqual([]);
    },
  );

  it('denies platform confusion and expired tokens', async () => {
    const f = fixture();
    await expect(f.service.resolve('discord', f.input)).rejects.toThrow(
      'unavailable',
    );
    await expect(
      f.service.resolve('telegram', { ...f.input, token: 'b'.repeat(32) }),
    ).rejects.toThrow('unavailable');
    expect(f.decisions).toEqual([]);
  });

  it('rechecks opt-in and membership at callback time', async () => {
    const f = fixture();
    f.integration.bindings = [];
    await expect(f.service.resolve('telegram', f.input)).rejects.toThrow(
      'unavailable',
    );
    f.integration.bindings = [receipt.binding];
    f.reviewers.clear();
    await expect(f.service.resolve('telegram', f.input)).rejects.toThrow(
      'unavailable',
    );
    expect(f.isTokenUnused()).toBe(true);
    expect(f.decisions).toEqual([]);
  });

  it('passes rejection through batch review without directly publishing', async () => {
    const f = fixture();
    await expect(
      f.service.resolve('telegram', { ...f.input, decision: 'reject' }),
    ).resolves.toEqual({ message: 'Draft rejected.', success: true });
    expect(f.decisions).toEqual([boundDecision('reject')]);
  });
});
