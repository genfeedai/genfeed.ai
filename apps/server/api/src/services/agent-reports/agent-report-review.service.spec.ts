import type { AgentReportReviewToken } from '@api/services/agent-reports/agent-report-binding';
import { AgentReportReviewService } from '@api/services/agent-reports/agent-report-review.service';
import { describe, expect, it, vi } from 'vitest';

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
  batchId: 'batch',
  itemId: 'item',
  postId: 'post',
  postVersion: '2026-09-24T10:00:00.000Z',
};
function fixture() {
  const cache = {
    get: vi.fn().mockResolvedValue(receipt),
    getdel: vi.fn().mockResolvedValueOnce(receipt).mockResolvedValue(null),
  };
  const prisma = {
    orgIntegration: {
      findFirst: vi.fn().mockResolvedValue({
        config: { agentReportBindings: [receipt.binding] },
      }),
    },
    agentStrategy: { findFirst: vi.fn().mockResolvedValue({ id: 'strategy' }) },
  };
  const access = { canReview: vi.fn().mockResolvedValue(true) };
  const review = { approveItems: vi.fn(), rejectItems: vi.fn() };
  const service = new AgentReportReviewService(
    prisma as never,
    cache as never,
    access as never,
    review as never,
  );
  return {
    service,
    cache,
    prisma,
    access,
    review,
    input: {
      organizationId: 'org',
      remoteUserId: 'remote',
      channelId: 'chat',
      token: 'a'.repeat(32),
      decision: 'approve' as const,
    },
  };
}
describe('bound agent report review', () => {
  it('uses canonical bound user and the original post version in normal review, consuming one token', async () => {
    const f = fixture();
    await f.service.resolve('telegram', f.input);
    expect(f.review.approveItems).toHaveBeenCalledWith(
      'batch',
      ['item'],
      'org',
      'canonical-user',
      false,
      { post: receipt.postVersion },
    );
    await expect(
      f.service.resolve('telegram', { ...f.input, decision: 'reject' }),
    ).rejects.toThrow('already used');
    expect(f.review.rejectItems).not.toHaveBeenCalled();
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
      expect(f.cache.getdel).not.toHaveBeenCalled();
      expect(f.review.approveItems).not.toHaveBeenCalled();
    },
  );
  it('denies platform confusion and expired tokens', async () => {
    const f = fixture();
    await expect(f.service.resolve('discord', f.input)).rejects.toThrow(
      'unavailable',
    );
    f.cache.get.mockResolvedValue(null);
    await expect(f.service.resolve('telegram', f.input)).rejects.toThrow(
      'unavailable',
    );
  });
  it('rechecks opt-in and membership at callback time', async () => {
    const f = fixture();
    f.prisma.orgIntegration.findFirst.mockResolvedValue({
      config: { agentReportBindings: [] },
    });
    await expect(f.service.resolve('telegram', f.input)).rejects.toThrow(
      'unavailable',
    );
    f.prisma.orgIntegration.findFirst.mockResolvedValue({
      config: { agentReportBindings: [receipt.binding] },
    });
    f.access.canReview.mockResolvedValue(false);
    await expect(f.service.resolve('telegram', f.input)).rejects.toThrow(
      'unavailable',
    );
    expect(f.cache.getdel).not.toHaveBeenCalled();
  });
  it('passes rejection through batch review without directly publishing', async () => {
    const f = fixture();
    await f.service.resolve('telegram', { ...f.input, decision: 'reject' });
    expect(f.review.rejectItems).toHaveBeenCalledWith(
      'batch',
      ['item'],
      'org',
      'Rejected from agent report',
      'canonical-user',
      { post: receipt.postVersion },
    );
    expect(f.review.approveItems).not.toHaveBeenCalled();
  });
});
