vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return {
    ...canonicalPrismaMock(),
    toPrismaJson: (value: unknown) => value,
  };
});

import { EngagementRulesService } from '@api/collections/engagement-rules/services/engagement-rules.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  EngagementMetric,
  EngagementRuleAction,
  EngagementRuleMode,
  EngagementRuleState,
} from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const context = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    actionPayload: { channels: [] },
    actionType: EngagementRuleAction.REPOST,
    brandId: 'brand-1',
    createdAt: new Date('2026-08-19T00:00:00.000Z'),
    id: 'rule-1',
    isDeleted: false,
    isEnabled: true,
    lastError: null,
    metric: EngagementMetric.LIKES,
    metricSnapshot: null,
    mode: EngagementRuleMode.APPROVAL,
    organizationId: 'org-1',
    postGroupId: 'group-1',
    resultingReleaseId: null,
    state: EngagementRuleState.ARMED,
    targetId: 'target-1',
    threshold: 10,
    triggeredAt: null,
    updatedAt: new Date('2026-08-19T00:00:00.000Z'),
    userId: 'user-1',
    windowEndsAt: null,
    ...overrides,
  };
}

describe('EngagementRulesService', () => {
  const engagementRule = {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const post = {
    findFirst: vi.fn(),
  };
  const prisma = {
    engagementRule,
    post,
  };

  let service: EngagementRulesService;

  beforeEach(() => {
    vi.clearAllMocks();
    engagementRule.create.mockImplementation(async ({ data }) =>
      makeRow({ ...data, id: 'rule-1' }),
    );
    engagementRule.findFirst.mockResolvedValue(makeRow());
    engagementRule.findMany.mockResolvedValue([makeRow()]);
    engagementRule.count.mockResolvedValue(1);
    engagementRule.update.mockImplementation(async ({ data }) => makeRow(data));
    post.findFirst.mockResolvedValue({ id: 'target-1' });
    service = new EngagementRulesService(prisma as unknown as PrismaService);
  });

  it('creates an armed tenant-scoped engagement rule', async () => {
    const created = await service.createScoped(
      {
        actionType: EngagementRuleAction.REPOST,
        metric: EngagementMetric.LIKES,
        postGroupId: 'group-1',
        targetId: 'target-1',
        threshold: 10,
      },
      context,
    );

    expect(engagementRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          state: EngagementRuleState.ARMED,
          userId: 'user-1',
        }),
      }),
    );
    expect(created.state).toBe(EngagementRuleState.ARMED);
    expect(created.isEnabled).toBe(true);
  });

  it('rejects a target that is not in the organization', async () => {
    post.findFirst.mockResolvedValue(null);

    await expect(
      service.createScoped(
        {
          actionType: EngagementRuleAction.REPOST,
          metric: EngagementMetric.LIKES,
          postGroupId: 'group-1',
          targetId: 'target-missing',
          threshold: 10,
        },
        context,
      ),
    ).rejects.toThrow(
      'Engagement rules require a release target in this organization.',
    );
  });

  it('lists through organization + isDeleted scope', async () => {
    await service.findAllScoped(context, {
      limit: 10,
      page: 1,
      postGroupId: 'group-1',
    } as never);

    expect(engagementRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: scopedWhere('org-1', { postGroupId: 'group-1' }),
      }),
    );
  });

  it('soft-deletes instead of hard-deleting', async () => {
    await service.removeScoped('rule-1', context);

    expect(engagementRule.update).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: scopedWhere('org-1', { id: 'rule-1' }),
    });
  });

  it('disables by setting state DISABLED', async () => {
    const updated = await service.updateScoped(
      'rule-1',
      { isEnabled: false },
      context,
    );

    expect(engagementRule.update).toHaveBeenCalledWith({
      data: {
        actionPayload: { channels: [] },
        isEnabled: false,
        mode: EngagementRuleMode.APPROVAL,
        state: EngagementRuleState.DISABLED,
      },
      where: scopedWhere('org-1', { id: 'rule-1' }),
    });
    expect(updated.state).toBe(EngagementRuleState.DISABLED);
  });
});
