vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@server/shared/testing/prisma-mock'
  );
  return {
    ...canonicalPrismaMock(),
    toPrismaJson: (value: unknown) => value,
  };
});

import {
  CredentialPlatform,
  EngagementMetric,
  EngagementRuleAction,
  EngagementRuleMode,
  EngagementRuleState,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { PostGroupsService } from '@server/collections/post-groups/services/post-groups.service';
import { PublisherFactoryService } from '@server/services/integrations/publishers/publisher-factory.service';
import { CronEngagementTriggersService } from '@workers/crons/engagement/cron.engagement-triggers.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    actionPayload: {
      channels: [{ credentialId: 'cred-2', platform: 'twitter' }],
    },
    actionType: EngagementRuleAction.REPOST,
    brandId: 'brand-1',
    id: 'rule-1',
    isDeleted: false,
    isEnabled: true,
    metric: EngagementMetric.LIKES,
    mode: EngagementRuleMode.APPROVAL,
    organizationId: 'org-1',
    postGroupId: 'group-1',
    state: EngagementRuleState.ARMED,
    targetId: 'target-1',
    threshold: 10,
    userId: 'user-1',
    windowEndsAt: null,
    ...overrides,
  };
}

describe('CronEngagementTriggersService', () => {
  const engagementRule = {
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const post = {
    findFirst: vi.fn(),
  };
  const postAnalytics = {
    findFirst: vi.fn(),
  };
  const credential = {
    findFirst: vi.fn(),
  };
  const prisma = {
    credential,
    engagementRule,
    post,
    postAnalytics,
  };
  const postGroupsService = {
    create: vi.fn(),
    publishNow: vi.fn(),
  };
  const publisherFactory = {
    getPublisher: vi.fn(),
  };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
  };
  let service: CronEngagementTriggersService;

  beforeEach(() => {
    vi.clearAllMocks();
    engagementRule.findMany.mockResolvedValue([makeRule()]);
    engagementRule.update.mockResolvedValue({});
    post.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      credentialId: 'cred-1',
      description: 'Original post',
      externalId: 'ext-1',
      id: 'target-1',
      label: 'Original',
      platform: CredentialPlatform.TWITTER,
    });
    postAnalytics.findFirst.mockResolvedValue({
      engagementRate: 0.1,
      totalComments: 2,
      totalLikes: 25,
      totalShares: 1,
      totalViews: 100,
    });
    credential.findFirst.mockResolvedValue({
      isConnected: true,
      platform: 'TWITTER',
    });
    postGroupsService.create.mockResolvedValue({ id: 'release-2' });
    publisherFactory.getPublisher.mockReturnValue(null);
    service = new CronEngagementTriggersService(
      logger as unknown as LoggerService,
      prisma as unknown as PrismaService,
      postGroupsService as unknown as PostGroupsService,
      publisherFactory as unknown as PublisherFactoryService,
    );
  });

  it('skips armed rules below the metric threshold', async () => {
    postAnalytics.findFirst.mockResolvedValue({
      engagementRate: 0,
      totalComments: 0,
      totalLikes: 1,
      totalShares: 0,
      totalViews: 0,
    });

    await service.processArmedRules();

    expect(engagementRule.update).not.toHaveBeenCalled();
    expect(postGroupsService.create).not.toHaveBeenCalled();
  });

  it('expires rules past their window', async () => {
    engagementRule.findMany.mockResolvedValue([
      makeRule({ windowEndsAt: new Date('2020-01-01T00:00:00.000Z') }),
    ]);

    await service.processArmedRules();

    expect(engagementRule.update).toHaveBeenCalledWith({
      data: { state: EngagementRuleState.EXPIRED },
      where: { id: 'rule-1' },
    });
    expect(postGroupsService.create).not.toHaveBeenCalled();
  });

  it('completes ineligible disconnected credentials without re-arming', async () => {
    credential.findFirst.mockResolvedValue({
      isConnected: false,
      platform: 'TWITTER',
    });

    await service.processArmedRules();

    expect(engagementRule.update).toHaveBeenCalledWith({
      data: {
        lastError: 'Connected credential is disconnected.',
        state: EngagementRuleState.COMPLETED,
      },
      where: { id: 'rule-1' },
    });
    expect(postGroupsService.create).not.toHaveBeenCalled();
  });

  it('fires a repost as a draft when mode is APPROVAL', async () => {
    await service.processArmedRules();

    expect(engagementRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: EngagementRuleState.TRIGGERED,
        }),
      }),
    );
    expect(postGroupsService.create).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        baseContent: 'Original post',
        title: 'Original',
      }),
      undefined,
      { source: 'engagement' },
    );
    expect(postGroupsService.publishNow).not.toHaveBeenCalled();
    expect(engagementRule.update).toHaveBeenCalledWith({
      data: {
        resultingReleaseId: 'release-2',
        state: EngagementRuleState.COMPLETED,
      },
      where: { id: 'rule-1' },
    });
  });

  it('isolates per-rule failures so later rules still run', async () => {
    engagementRule.findMany.mockResolvedValue([
      makeRule({ id: 'rule-1' }),
      makeRule({ id: 'rule-2' }),
    ]);
    post.findFirst
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({
        brandId: 'brand-1',
        credentialId: 'cred-1',
        description: 'Original post',
        externalId: 'ext-1',
        id: 'target-1',
        label: 'Original',
        platform: CredentialPlatform.TWITTER,
      });

    await service.processArmedRules();

    expect(logger.error).toHaveBeenCalled();
    expect(postGroupsService.create).toHaveBeenCalled();
  });
});
