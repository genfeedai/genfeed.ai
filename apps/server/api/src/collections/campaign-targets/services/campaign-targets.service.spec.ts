import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CampaignDiscoverySource,
  CampaignPlatform,
  CampaignStatus,
  CampaignTargetStatus,
  CampaignTargetType,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

type CampaignTargetRow = {
  campaignId: string;
  data: Record<string, unknown>;
  externalId?: string | null;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  scheduleVersion?: number;
  status: string;
};

type PrismaTxCallback = (
  tx: ReturnType<typeof createPrismaStub>['prisma'],
) => Promise<unknown>;

function createPrismaStub() {
  const prisma = {
    $transaction: vi.fn(),
    campaignTarget: {
      count: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    outreachCampaign: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  prisma.$transaction.mockImplementation((callback: PrismaTxCallback) =>
    callback(prisma),
  );

  return { prisma };
}

describe('CampaignTargetsService tenant persistence', () => {
  const campaignId = 'campaign-1';
  const organizationId = 'org-1';
  const foreignOrganizationId = 'org-foreign';
  const targetId = 'target-1';

  const makeService = () => {
    const { prisma } = createPrismaStub();
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    return {
      prisma,
      service: new CampaignTargetsService(
        prisma as unknown as PrismaService,
        logger as unknown as LoggerService,
      ),
    };
  };

  const makeTargetDto = (
    overrides: Record<string, unknown> = {},
  ): Parameters<CampaignTargetsService['createMany']>[0][number] =>
    ({
      campaignId,
      contentUrl: 'https://x.com/user/status/1',
      discoverySource: CampaignDiscoverySource.MANUAL,
      externalId: 'ext-1',
      organizationId,
      platform: CampaignPlatform.TWITTER,
      targetType: CampaignTargetType.TWEET,
      ...overrides,
    }) as Parameters<CampaignTargetsService['createMany']>[0][number];

  const makeRow = (
    overrides: Partial<CampaignTargetRow> = {},
  ): CampaignTargetRow => ({
    campaignId,
    data: {},
    id: targetId,
    isDeleted: false,
    organizationId,
    status: CampaignTargetStatus.PENDING,
    ...overrides,
  });

  const activeParent = {
    isDeleted: false,
    organizationId,
    status: CampaignStatus.ACTIVE,
  };

  const anyParent = {
    isDeleted: false,
    organizationId,
  };

  it('derives organization from the parent campaign and updates totalTargets in one transaction', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findFirst.mockResolvedValue({
      config: { totalTargets: 2 },
      id: campaignId,
      organizationId,
    });
    prisma.campaignTarget.createMany.mockResolvedValue({ count: 1 });
    prisma.outreachCampaign.updateMany.mockResolvedValue({ count: 1 });

    const added = await service.createManyForCampaign(
      campaignId,
      organizationId,
      [makeTargetDto({ organizationId: foreignOrganizationId })],
    );

    expect(added).toBe(1);
    expect(prisma.outreachCampaign.findFirst).toHaveBeenCalledWith({
      where: {
        id: campaignId,
        isDeleted: false,
        organizationId,
      },
    });
    expect(prisma.campaignTarget.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          campaignId,
          organizationId,
        }),
      ],
    });
    expect(prisma.outreachCampaign.updateMany).toHaveBeenCalledWith({
      data: {
        config: expect.objectContaining({ totalTargets: 3 }),
        updatedAt: expect.any(Date),
      },
      where: {
        id: campaignId,
        isDeleted: false,
        organizationId,
      },
    });
  });

  it('rolls back target creation when the counter update changes zero rows', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findFirst.mockResolvedValue({
      config: { totalTargets: 0 },
      id: campaignId,
      organizationId,
    });
    prisma.campaignTarget.createMany.mockResolvedValue({ count: 1 });
    prisma.outreachCampaign.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.createManyForCampaign(campaignId, organizationId, [
        makeTargetDto(),
      ]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns NotFound for a foreign parent campaign before any target write', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findFirst.mockResolvedValue(null);

    await expect(
      service.createManyForCampaign(campaignId, foreignOrganizationId, [
        makeTargetDto({ organizationId: foreignOrganizationId }),
      ]),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.campaignTarget.createMany).not.toHaveBeenCalled();
  });

  it('scopes history reads to matching organization and live parent without requiring ACTIVE', async () => {
    const { prisma, service } = makeService();
    prisma.campaignTarget.findMany.mockResolvedValue([makeRow()]);

    await service.findByCampaign(campaignId, organizationId);

    expect(prisma.campaignTarget.findMany).toHaveBeenCalledWith({
      where: {
        campaign: anyParent,
        campaignId,
        isDeleted: false,
        organizationId,
      },
    });
  });

  it('requires an ACTIVE parent for pending batch selection', async () => {
    const { prisma, service } = makeService();
    prisma.campaignTarget.findMany.mockResolvedValue([]);

    await service.getPendingTargets(campaignId, organizationId, 10);

    expect(prisma.campaignTarget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              status: {
                in: [
                  CampaignTargetStatus.PENDING,
                  CampaignTargetStatus.SCHEDULED,
                ],
              },
            },
            {
              OR: [
                {
                  scheduledAt: null,
                  status: CampaignTargetStatus.PENDING,
                },
                { scheduledAt: { lte: expect.any(Date) } },
              ],
            },
          ],
          campaign: activeParent,
          campaignId,
          isDeleted: false,
          organizationId,
        }),
      }),
    );
  });

  it('claims pending targets with a scoped status CAS', async () => {
    const { prisma, service } = makeService();
    prisma.campaignTarget.updateMany.mockResolvedValue({ count: 1 });
    prisma.campaignTarget.findFirst.mockResolvedValue(
      makeRow({ status: CampaignTargetStatus.PROCESSING }),
    );

    const claimed = await service.claimForProcessing(targetId, organizationId);

    expect(claimed?.status).toBe(CampaignTargetStatus.PROCESSING);
    expect(prisma.campaignTarget.updateMany).toHaveBeenCalledWith({
      data: { status: CampaignTargetStatus.PROCESSING },
      where: expect.objectContaining({
        AND: expect.any(Array),
        campaign: activeParent,
        id: targetId,
        isDeleted: false,
        organizationId,
      }),
    });
  });

  it('grants one CAS claim when two workers race the same target', async () => {
    const { prisma, service } = makeService();
    prisma.campaignTarget.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.campaignTarget.findFirst.mockResolvedValue(
      makeRow({ status: CampaignTargetStatus.PROCESSING }),
    );

    const [winner, loser] = await Promise.all([
      service.claimForProcessing(targetId, organizationId),
      service.claimForProcessing(targetId, organizationId),
    ]);

    expect(winner).not.toBeNull();
    expect(loser).toBeNull();
  });

  it('returns null for foreign, deleted, or inactive-parent claims', async () => {
    const { prisma, service } = makeService();
    prisma.campaignTarget.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.claimForProcessing(targetId, foreignOrganizationId),
    ).resolves.toBeNull();
    expect(prisma.campaignTarget.findFirst).not.toHaveBeenCalled();
  });

  it('allows terminal bookkeeping after pause but not after tenant relocation', async () => {
    const { prisma, service } = makeService();
    prisma.campaignTarget.updateMany.mockResolvedValue({ count: 1 });
    prisma.campaignTarget.findFirst.mockResolvedValue(
      makeRow({ status: CampaignTargetStatus.REPLIED }),
    );

    await service.markAsReplied(targetId, organizationId, {
      replyExternalId: 'reply-1',
      replyText: 'thanks',
      replyUrl: 'https://x.com/r/1',
    });

    expect(prisma.campaignTarget.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: CampaignTargetStatus.REPLIED,
      }),
      where: {
        campaign: anyParent,
        id: targetId,
        isDeleted: false,
        organizationId,
        status: CampaignTargetStatus.PROCESSING,
      },
    });

    prisma.campaignTarget.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.markAsReplied(targetId, foreignOrganizationId, {
        replyExternalId: 'reply-1',
        replyText: 'thanks',
        replyUrl: 'https://x.com/r/1',
      }),
    ).resolves.toBeNull();
  });

  it('hydrates and updates typed JSON fields through the data document', async () => {
    const { prisma, service } = makeService();
    const existing = makeRow({
      data: { authorUsername: 'alice' },
      status: CampaignTargetStatus.PROCESSING,
    });
    prisma.campaignTarget.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({
        ...existing,
        data: {
          authorUsername: 'alice',
          dmSentAt: '2026-08-24T12:00:00.000Z',
          dmText: 'hello',
          recipientUserId: 'user-9',
        },
        processedAt: new Date('2026-08-24T12:01:00.000Z'),
        status: CampaignTargetStatus.SENT,
      });
    prisma.campaignTarget.updateMany.mockResolvedValue({ count: 1 });

    const updated = await service.updateOne(targetId, organizationId, {
      dmSentAt: new Date('2026-08-24T12:00:00.000Z'),
      dmText: 'hello',
      processedAt: new Date('2026-08-24T12:01:00.000Z'),
      recipientUserId: 'user-9',
      status: CampaignTargetStatus.SENT,
    });

    expect(prisma.campaignTarget.updateMany).toHaveBeenCalledWith({
      data: {
        data: {
          authorUsername: 'alice',
          dmSentAt: '2026-08-24T12:00:00.000Z',
          dmText: 'hello',
          recipientUserId: 'user-9',
        },
        processedAt: new Date('2026-08-24T12:01:00.000Z'),
        status: CampaignTargetStatus.SENT,
      },
      where: {
        campaign: anyParent,
        id: targetId,
        isDeleted: false,
        organizationId,
      },
    });
    expect(updated?.dmText).toBe('hello');
    expect(updated?.recipientUserId).toBe('user-9');
    expect(updated?.dmSentAt).toEqual(new Date('2026-08-24T12:00:00.000Z'));
  });

  it('scopes aggregates, retries, and existence checks to the tenant parent', async () => {
    const { prisma, service } = makeService();
    prisma.campaignTarget.count.mockResolvedValue(0);
    prisma.campaignTarget.updateMany.mockResolvedValue({ count: 0 });
    prisma.campaignTarget.findMany.mockResolvedValue([]);

    await service.getTargetStats(campaignId, organizationId);
    await service.resetFailedTargets(campaignId, organizationId);
    await service.findExistingExternalIds(campaignId, organizationId, [
      'ext-1',
    ]);

    expect(prisma.campaignTarget.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        campaign: anyParent,
        campaignId,
        isDeleted: false,
        organizationId,
      }),
    });
    expect(prisma.campaignTarget.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: CampaignTargetStatus.PENDING,
      }),
      where: {
        campaign: anyParent,
        campaignId,
        isDeleted: false,
        organizationId,
        status: CampaignTargetStatus.FAILED,
      },
    });
    expect(prisma.campaignTarget.findMany).toHaveBeenCalledWith({
      select: { externalId: true },
      where: {
        campaign: anyParent,
        campaignId,
        externalId: { in: ['ext-1'] },
        isDeleted: false,
        organizationId,
      },
    });
  });

  it('selects due SCHEDULED targets and excludes future or schedule-less ones', async () => {
    const { prisma, service } = makeService();
    const dueAt = new Date('2026-08-24T12:00:00.000Z');
    prisma.campaignTarget.findMany.mockResolvedValue([
      makeRow({ status: CampaignTargetStatus.SCHEDULED }),
    ]);

    await service.getPendingTargets(campaignId, organizationId, 10, {
      now: dueAt,
      scheduleVersion: 2,
    });

    expect(prisma.campaignTarget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              status: {
                in: [
                  CampaignTargetStatus.PENDING,
                  CampaignTargetStatus.SCHEDULED,
                ],
              },
            },
            {
              OR: [
                {
                  scheduledAt: null,
                  status: CampaignTargetStatus.PENDING,
                },
                { scheduledAt: { lte: dueAt } },
              ],
            },
          ],
          scheduleVersion: 2,
        }),
      }),
    );
  });

  it('claims a due SCHEDULED target and rejects early, stale, paused, and cancelled rows', async () => {
    const { prisma, service } = makeService();
    const dueAt = new Date('2026-08-24T12:00:00.000Z');
    prisma.campaignTarget.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 });
    prisma.campaignTarget.findFirst.mockResolvedValue(
      makeRow({ status: CampaignTargetStatus.PROCESSING }),
    );

    const claimed = await service.claimForProcessing(targetId, organizationId, {
      now: dueAt,
      scheduleVersion: 1,
    });
    expect(claimed).not.toBeNull();

    await expect(
      service.claimForProcessing(targetId, organizationId, {
        now: new Date('2026-08-24T11:59:59.000Z'),
        scheduleVersion: 1,
      }),
    ).resolves.toBeNull();
    await expect(
      service.claimForProcessing(targetId, organizationId, {
        now: dueAt,
        scheduleVersion: 2,
      }),
    ).resolves.toBeNull();
  });

  it('reschedules an open target by bumping scheduleVersion and keeps cancel side-effect free for claims', async () => {
    const { prisma, service } = makeService();
    const future = new Date('2026-08-25T13:00:00.000Z');
    prisma.campaignTarget.findFirst.mockResolvedValue(
      makeRow({
        scheduleVersion: 1,
        status: CampaignTargetStatus.SCHEDULED,
      }),
    );
    prisma.campaignTarget.updateMany.mockResolvedValue({ count: 1 });

    await service.scheduleTarget(targetId, organizationId, future, {
      now: new Date('2026-08-24T12:00:00.000Z'),
    });

    expect(prisma.campaignTarget.updateMany).toHaveBeenCalledWith({
      data: {
        scheduledAt: future,
        scheduleVersion: 2,
        status: CampaignTargetStatus.SCHEDULED,
      },
      where: expect.objectContaining({
        status: CampaignTargetStatus.SCHEDULED,
      }),
    });

    prisma.campaignTarget.findFirst.mockResolvedValue(
      makeRow({ status: CampaignTargetStatus.SCHEDULED }),
    );
    await service.cancelTarget(targetId, organizationId);
    expect(prisma.campaignTarget.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        skipReason: 'manual_skip',
        status: CampaignTargetStatus.SKIPPED,
      }),
      where: expect.objectContaining({
        status: CampaignTargetStatus.SCHEDULED,
      }),
    });
  });

  it('blocks inherited BaseService surfaces that cannot carry tenant parent scope', async () => {
    const { service } = makeService();

    await expect(service.find({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.findOne({ id: targetId })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.findAll()).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.patch(targetId, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.remove(targetId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
