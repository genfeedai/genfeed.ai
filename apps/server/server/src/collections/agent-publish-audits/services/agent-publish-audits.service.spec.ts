vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@server/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { AgentPublishDecision } from '@genfeedai/enums';
import { scopedWhere } from '@genfeedai/server';
import { AgentPublishAuditsService } from '@server/collections/agent-publish-audits/services/agent-publish-audits.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    agentRunId: 'run-1',
    agentStrategyId: 'strategy-1',
    agentThreadId: 'thread-1',
    autonomyMode: 'SUPERVISED',
    brandId: 'brand-1',
    channel: 'twitter',
    createdAt: new Date('2026-08-19T00:00:00.000Z'),
    decision: AgentPublishDecision.DENIED,
    id: 'audit-1',
    isDeleted: false,
    organizationId: 'org-1',
    policyName: 'autonomy-brand-channel',
    postGroupId: 'group-1',
    reason: 'Autonomy mode requires human approval.',
    updatedAt: new Date('2026-08-19T00:00:00.000Z'),
    userId: 'user-1',
    ...overrides,
  };
}

describe('AgentPublishAuditsService', () => {
  const agentPublishAudit = {
    count: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  };
  const prisma = { agentPublishAudit };
  let service: AgentPublishAuditsService;

  beforeEach(() => {
    vi.clearAllMocks();
    agentPublishAudit.create.mockImplementation(async ({ data }) =>
      makeRow({ ...data, id: 'audit-1' }),
    );
    agentPublishAudit.findMany.mockResolvedValue([makeRow()]);
    agentPublishAudit.count.mockResolvedValue(1);
    service = new AgentPublishAuditsService(prisma as unknown as PrismaService);
  });

  it('writes an org-scoped audit row', async () => {
    const created = await service.createAudit({
      autonomyMode: 'SUPERVISED',
      decision: AgentPublishDecision.DENIED,
      organizationId: 'org-1',
      policyName: 'autonomy-brand-channel',
      reason: 'Autonomy mode requires human approval.',
      userId: 'user-1',
    });

    expect(agentPublishAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      }),
    );
    expect(created.decision).toBe(AgentPublishDecision.DENIED);
  });

  it('lists through organization + isDeleted scope', async () => {
    await service.findAllScoped(
      { organizationId: 'org-1', userId: 'user-1' },
      { agentRunId: 'run-1', limit: 10, page: 1, postGroupId: 'group-1' },
    );

    expect(agentPublishAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: scopedWhere('org-1', {
          agentRunId: 'run-1',
          postGroupId: 'group-1',
        }),
      }),
    );
  });
});
