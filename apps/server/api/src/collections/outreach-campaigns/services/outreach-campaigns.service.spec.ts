import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { REPLY_SLOT_HOUR_MS } from '@api/collections/outreach-campaigns/services/outreach-reply-slot.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

type OutreachCampaignRow = {
  campaignType?: string;
  config: Record<string, unknown>;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  platform?: string;
  status: string;
};

type PrismaTxCallback = (
  tx: ReturnType<typeof createPrismaStub>['prisma'],
) => Promise<unknown>;

function createPrismaStub() {
  const prisma = {
    $transaction: vi.fn(),
    brand: {
      findFirst: vi.fn(),
    },
    credential: {
      findFirst: vi.fn(),
    },
    campaignTarget: {
      updateMany: vi.fn(),
    },
    outreachCampaign: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  prisma.$transaction.mockImplementation((callback: PrismaTxCallback) =>
    callback(prisma),
  );

  return { prisma };
}

describe('OutreachCampaignsService', () => {
  const makeService = () => {
    const { prisma } = createPrismaStub();

    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    return {
      logger,
      prisma,
      service: new OutreachCampaignsService(
        prisma as unknown as PrismaService,
        logger as unknown as LoggerService,
      ),
    };
  };

  const now = new Date('2026-08-24T12:00:00.000Z');
  const campaignId = 'campaign-1';
  const organizationId = 'org-1';

  const makeRow = (
    overrides: Partial<OutreachCampaignRow> & {
      rateLimits?: Record<string, unknown>;
    } = {},
  ): OutreachCampaignRow => {
    const { rateLimits, config, ...rest } = overrides;
    return {
      campaignType: CampaignType.MANUAL,
      config: {
        rateLimits: {
          currentDayCount: 0,
          currentHourCount: 0,
          dayResetAt: new Date(now.getTime() + 86400 * 1000).toISOString(),
          hourResetAt: new Date(
            now.getTime() + REPLY_SLOT_HOUR_MS,
          ).toISOString(),
          maxPerDay: 50,
          maxPerHour: 10,
          ...rateLimits,
        },
        ...(config ?? {}),
      },
      id: campaignId,
      isDeleted: false,
      organizationId,
      platform: CampaignPlatform.TWITTER,
      status: CampaignStatus.ACTIVE,
      ...rest,
    };
  };

  describe('findAll', () => {
    it('normalizes transport sort directions before calling Prisma', async () => {
      const { prisma, service } = makeService();
      prisma.outreachCampaign.findMany.mockResolvedValue([]);
      prisma.outreachCampaign.count.mockResolvedValue(0);

      await service.findAll(
        {
          orderBy: { createdAt: -1 },
          where: { organizationId },
        },
        { limit: 100, page: 1 },
      );

      expect(prisma.outreachCampaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }],
        }),
      );
    });
  });

  it('creates campaigns with auth-scoped owner fields instead of DTO owner overrides', async () => {
    const { prisma, service } = makeService();

    prisma.brand.findFirst.mockResolvedValue({
      id: 'brand-owned',
      organizationId: 'org-owned',
    });
    prisma.credential.findFirst.mockResolvedValue({
      id: 'credential-owned',
      brandId: 'brand-owned',
      organizationId: 'org-owned',
    });
    prisma.outreachCampaign.create.mockResolvedValue({
      brandId: 'brand-owned',
      config: {
        credential: 'credential-owned',
        label: 'Campaign',
        platform: CampaignPlatform.TWITTER,
      },
      id: 'campaign-1',
      isDeleted: false,
      organizationId: 'org-owned',
      status: 'draft',
      userId: 'user-owned',
    });

    await service.createScoped(
      {
        brand: 'brand-attacker',
        campaignType: CampaignType.MANUAL,
        credential: 'credential-owned',
        label: 'Campaign',
        organization: 'org-attacker',
        platform: CampaignPlatform.TWITTER,
        user: 'user-attacker',
      },
      {
        brandId: 'brand-owned',
        organizationId: 'org-owned',
        userId: 'user-owned',
      },
    );

    expect(prisma.credential.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        brandId: 'brand-owned',
        isConnected: true,
        isDeleted: false,
        organizationId: 'org-owned',
        platform: 'TWITTER',
      }),
    });
    expect(prisma.outreachCampaign.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-owned',
        organizationId: 'org-owned',
        userId: 'user-owned',
      }),
    });
  });

  it('rejects an unavailable create pair before tenant lookups or persistence', async () => {
    const { prisma, service } = makeService();

    await expect(
      service.createScoped(
        {
          campaignType: CampaignType.MANUAL,
          credentialId: 'credential-owned',
          label: 'Campaign',
          platform: CampaignPlatform.REDDIT,
        },
        {
          brandId: 'brand-owned',
          organizationId: 'org-owned',
          userId: 'user-owned',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.brand.findFirst).not.toHaveBeenCalled();
    expect(prisma.credential.findFirst).not.toHaveBeenCalled();
    expect(prisma.outreachCampaign.create).not.toHaveBeenCalled();
  });

  it('rejects Scheduled Blast creates that omit a future schedule', async () => {
    const { prisma, service } = makeService();

    await expect(
      service.createScoped(
        {
          campaignType: CampaignType.SCHEDULED_BLAST,
          credentialId: 'credential-owned',
          label: 'Campaign',
          platform: CampaignPlatform.TWITTER,
        },
        { organizationId: 'org-owned' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'outreach_schedule.missing',
      }),
    });
    expect(prisma.outreachCampaign.create).not.toHaveBeenCalled();
  });

  it('persists a Scheduled Blast UTC due instant and display timezone', async () => {
    const { prisma, service } = makeService();

    prisma.credential.findFirst.mockResolvedValue({
      id: 'credential-owned',
      organizationId: 'org-owned',
    });
    prisma.outreachCampaign.create.mockResolvedValue({
      campaignType: CampaignType.SCHEDULED_BLAST,
      config: {
        label: 'Launch',
        schedule: {
          dueAt: '2099-01-02T14:00:00.000Z',
          localDateTime: '2099-01-02T09:00',
          timezone: 'America/New_York',
          version: 1,
        },
      },
      id: 'campaign-1',
      isDeleted: false,
      organizationId: 'org-owned',
      platform: CampaignPlatform.TWITTER,
      status: 'draft',
    });

    await service.createScoped(
      {
        campaignType: CampaignType.SCHEDULED_BLAST,
        credentialId: 'credential-owned',
        label: 'Launch',
        platform: CampaignPlatform.TWITTER,
        schedule: {
          localDateTime: '2099-01-02T09:00',
          timezone: 'America/New_York',
        },
      },
      { organizationId: 'org-owned' },
    );

    expect(prisma.outreachCampaign.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaignType: CampaignType.SCHEDULED_BLAST,
        config: expect.objectContaining({
          schedule: {
            dueAt: '2099-01-02T14:00:00.000Z',
            localDateTime: '2099-01-02T09:00',
            timezone: 'America/New_York',
            version: 1,
          },
        }),
      }),
    });
  });

  it('rejects starting a Scheduled Blast that has no due time', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findFirst.mockResolvedValue(
      makeRow({
        campaignType: CampaignType.SCHEDULED_BLAST,
        config: {},
        status: CampaignStatus.DRAFT,
      }),
    );

    await expect(
      service.start(campaignId, organizationId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'outreach_schedule.missing',
      }),
    });
    expect(prisma.outreachCampaign.updateMany).not.toHaveBeenCalled();
    expect(prisma.campaignTarget.updateMany).not.toHaveBeenCalled();
  });

  it('bumps schedule version and retargets open rows on reschedule', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findFirst.mockResolvedValue(
      makeRow({
        campaignType: CampaignType.SCHEDULED_BLAST,
        config: {
          schedule: {
            dueAt: '2026-08-25T13:00:00.000Z',
            localDateTime: '2026-08-25T09:00',
            timezone: 'America/New_York',
            version: 1,
          },
        },
        status: CampaignStatus.DRAFT,
      }),
    );
    prisma.outreachCampaign.updateMany.mockResolvedValue({ count: 1 });
    prisma.campaignTarget.updateMany.mockResolvedValue({ count: 2 });

    await service.patch(
      campaignId,
      {
        schedule: {
          localDateTime: '2099-01-02T09:00',
          timezone: 'America/New_York',
        },
      },
      organizationId,
    );

    expect(prisma.outreachCampaign.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          schedule: expect.objectContaining({
            dueAt: '2099-01-02T14:00:00.000Z',
            version: 2,
          }),
        }),
      }),
      where: expect.objectContaining({
        id: campaignId,
        organizationId,
      }),
    });
    expect(prisma.campaignTarget.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scheduleVersion: 2,
        status: 'SCHEDULED',
      }),
      where: expect.objectContaining({
        campaignId,
        organizationId,
      }),
    });
  });

  it('rejects activating an unavailable historical campaign before status mutation', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findFirst.mockResolvedValue(
      makeRow({
        campaignType: CampaignType.MANUAL,
        platform: CampaignPlatform.INSTAGRAM,
        status: CampaignStatus.DRAFT,
      }),
    );

    await expect(
      service.start(campaignId, organizationId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.outreachCampaign.updateMany).not.toHaveBeenCalled();
  });

  it('rejects capability-changing updates on an active campaign', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findFirst.mockResolvedValue(
      makeRow({
        campaignType: CampaignType.MANUAL,
        platform: CampaignPlatform.TWITTER,
        status: CampaignStatus.ACTIVE,
      }),
    );

    await expect(
      service.patch(
        campaignId,
        { campaignType: CampaignType.DM_OUTREACH },
        organizationId,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'outreach_capability.active_configuration_locked',
      }),
    });
    expect(prisma.credential.findFirst).not.toHaveBeenCalled();
    expect(prisma.outreachCampaign.updateMany).not.toHaveBeenCalled();
  });

  it('allows non-capability updates on a historical unavailable campaign', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findFirst
      .mockResolvedValueOnce(
        makeRow({
          campaignType: CampaignType.MANUAL,
          platform: CampaignPlatform.REDDIT,
          status: CampaignStatus.DRAFT,
        }),
      )
      .mockResolvedValueOnce(
        makeRow({
          campaignType: CampaignType.MANUAL,
          config: { label: 'Renamed' },
          platform: CampaignPlatform.REDDIT,
          status: CampaignStatus.DRAFT,
        }),
      );
    prisma.outreachCampaign.updateMany.mockResolvedValue({ count: 1 });

    await service.patch(campaignId, { label: 'Renamed' }, organizationId);

    expect(prisma.outreachCampaign.updateMany).toHaveBeenCalled();
  });

  it('rejects credentials outside the authenticated organization and brand scope', async () => {
    const { prisma, service } = makeService();

    prisma.brand.findFirst.mockResolvedValue({
      id: 'brand-owned',
      organizationId: 'org-owned',
    });
    prisma.credential.findFirst.mockResolvedValue(null);

    await expect(
      service.createScoped(
        {
          campaignType: CampaignType.MANUAL,
          credential: 'foreign-credential',
          label: 'Campaign',
          platform: CampaignPlatform.TWITTER,
        },
        {
          brandId: 'brand-owned',
          organizationId: 'org-owned',
          userId: 'user-owned',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('finds one campaign using canonical scalar filters', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findFirst.mockResolvedValue({
      config: { label: 'Campaign' },
      id: 'campaign-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: 'draft',
    });

    const campaign = await service.findOne({
      id: 'campaign-1',
      isDeleted: false,
      organizationId: 'org-1',
    });

    expect(prisma.outreachCampaign.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'campaign-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(campaign?.label).toBe('Campaign');
  });

  it('implements BaseCRUD-compatible remove as a scoped soft delete', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findFirst
      .mockResolvedValueOnce({
        config: {},
        id: 'campaign-1',
        isDeleted: false,
        organizationId: 'org-1',
        status: 'draft',
      })
      .mockResolvedValueOnce({
        config: {},
        id: 'campaign-1',
        isDeleted: true,
        organizationId: 'org-1',
        status: 'draft',
      });
    prisma.outreachCampaign.updateMany.mockResolvedValue({ count: 1 });

    await service.remove('campaign-1', 'org-1');

    expect(prisma.outreachCampaign.updateMany).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: {
        id: 'campaign-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('returns the same NotFound for foreign and deleted campaign writes', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findFirst.mockResolvedValue(null);

    await expect(
      service.patch('campaign-1', { label: 'x' }, 'org-foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.start('campaign-1', 'org-foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.outreachCampaign.updateMany).not.toHaveBeenCalled();
  });

  it('ignores deleted-row filters and requires organization context on findOne', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findFirst.mockResolvedValue(makeRow());

    await service.findOne({
      id: campaignId,
      isDeleted: true,
      organizationId,
    });

    expect(prisma.outreachCampaign.findFirst).toHaveBeenCalledWith({
      where: {
        id: campaignId,
        isDeleted: false,
        organizationId,
      },
    });
  });

  it('blocks generic unscoped find in favor of system-only active inventory', async () => {
    const { prisma, service } = makeService();
    prisma.outreachCampaign.findMany.mockResolvedValue([makeRow()]);

    await expect(
      service.find({
        isDeleted: false,
        organizationId,
        status: CampaignStatus.ACTIVE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.outreachCampaign.findMany.mockResolvedValue([
      makeRow(),
      makeRow({
        campaignType: CampaignType.SCHEDULED_BLAST,
        config: {},
        id: 'scheduled-not-due',
      }),
    ]);

    const campaigns = await service.findActiveForDispatch(organizationId, now);
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]?.id).toBe(campaignId);
    expect(prisma.outreachCampaign.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        organizationId,
        status: CampaignStatus.ACTIVE,
      },
    });
  });

  describe('reply slot reservation', () => {
    it('denies canReply on an hourly rollover when the daily cap is exhausted', async () => {
      const { prisma, service } = makeService();
      prisma.outreachCampaign.findFirst.mockResolvedValue(
        makeRow({
          rateLimits: {
            currentDayCount: 50,
            currentHourCount: 10,
            hourResetAt: new Date(now.getTime() - 1).toISOString(),
            maxPerDay: 50,
            maxPerHour: 10,
          },
        }),
      );

      await expect(
        service.canReply(campaignId, organizationId, now),
      ).resolves.toBe(false);
      expect(prisma.outreachCampaign.update).not.toHaveBeenCalled();
      expect(prisma.outreachCampaign.updateMany).not.toHaveBeenCalled();
    });

    it('denies canReply on a daily rollover when the hourly cap is exhausted', async () => {
      const { prisma, service } = makeService();
      prisma.outreachCampaign.findFirst.mockResolvedValue(
        makeRow({
          rateLimits: {
            currentDayCount: 50,
            currentHourCount: 10,
            dayResetAt: new Date(now.getTime() - 1).toISOString(),
            maxPerDay: 50,
            maxPerHour: 10,
          },
        }),
      );

      await expect(
        service.canReply(campaignId, organizationId, now),
      ).resolves.toBe(false);
    });

    it('reserves one slot and increments both normalized counters exactly once', async () => {
      const { prisma, service } = makeService();
      const row = makeRow({
        rateLimits: {
          currentDayCount: 4,
          currentHourCount: 2,
        },
      });
      prisma.outreachCampaign.findFirst.mockResolvedValue(row);
      prisma.outreachCampaign.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.reserveReplySlot(campaignId, organizationId, now),
      ).resolves.toEqual({ reserved: true });

      expect(prisma.outreachCampaign.findFirst).toHaveBeenCalledWith({
        where: {
          id: campaignId,
          isDeleted: false,
          organizationId,
          status: CampaignStatus.ACTIVE,
        },
      });
      expect(prisma.outreachCampaign.updateMany).toHaveBeenCalledWith({
        data: {
          config: expect.objectContaining({
            rateLimits: expect.objectContaining({
              currentDayCount: 5,
              currentHourCount: 3,
            }),
          }),
          updatedAt: now,
        },
        where: {
          id: campaignId,
          isDeleted: false,
          organizationId,
          status: CampaignStatus.ACTIVE,
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
    });

    it('denies a reservation after the hourly window resets when the daily cap is exhausted', async () => {
      const { prisma, service } = makeService();
      prisma.outreachCampaign.findFirst.mockResolvedValue(
        makeRow({
          rateLimits: {
            currentDayCount: 50,
            currentHourCount: 10,
            hourResetAt: new Date(now.getTime() - 1).toISOString(),
            maxPerDay: 50,
            maxPerHour: 10,
          },
        }),
      );

      await expect(
        service.reserveReplySlot(campaignId, organizationId, now),
      ).resolves.toEqual({ reserved: false });
      expect(prisma.outreachCampaign.updateMany).not.toHaveBeenCalled();
    });

    it('denies a reservation after the daily window resets when the hourly cap is exhausted', async () => {
      const { prisma, service } = makeService();
      prisma.outreachCampaign.findFirst.mockResolvedValue(
        makeRow({
          rateLimits: {
            currentDayCount: 50,
            currentHourCount: 10,
            dayResetAt: new Date(now.getTime() - 1).toISOString(),
            maxPerDay: 50,
            maxPerHour: 10,
          },
        }),
      );

      await expect(
        service.reserveReplySlot(campaignId, organizationId, now),
      ).resolves.toEqual({ reserved: false });
      expect(prisma.outreachCampaign.updateMany).not.toHaveBeenCalled();
    });

    it('fail-closes for foreign, paused, deleted, and relocated campaigns', async () => {
      const { prisma, service } = makeService();
      prisma.outreachCampaign.findFirst.mockResolvedValue(null);

      await expect(
        service.reserveReplySlot(campaignId, 'org-foreign', now),
      ).resolves.toEqual({ reserved: false });
      await expect(
        service.canReply(campaignId, 'org-foreign', now),
      ).resolves.toBe(false);
      expect(prisma.outreachCampaign.updateMany).not.toHaveBeenCalled();
    });

    it('fail-closes when ownership changes before the reservation write commits', async () => {
      const { prisma, service } = makeService();
      prisma.outreachCampaign.findFirst.mockResolvedValue(makeRow());
      prisma.outreachCampaign.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reserveReplySlot(campaignId, organizationId, now),
      ).resolves.toEqual({ reserved: false });
    });

    it('retries serialization failures and fail-closes after they are exhausted', async () => {
      const { prisma, service } = makeService();
      prisma.$transaction
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockRejectedValueOnce({ code: 'P2034' });

      await expect(
        service.reserveReplySlot(campaignId, organizationId, now),
      ).resolves.toEqual({ reserved: false });
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it('keeps the reserved counters after a later success increment so retries cannot reclaim the slot', async () => {
      const { prisma, service } = makeService();
      const reservedRow = makeRow({
        rateLimits: {
          currentDayCount: 1,
          currentHourCount: 1,
          maxPerDay: 1,
          maxPerHour: 1,
        },
      });
      prisma.outreachCampaign.findFirst.mockResolvedValue(reservedRow);
      prisma.outreachCampaign.updateMany.mockResolvedValue({ count: 1 });

      await service.incrementReplyCounters(campaignId, organizationId);

      const written = prisma.outreachCampaign.updateMany.mock.calls[0]?.[0] as {
        data: { config: { rateLimits: Record<string, unknown> } };
        where: { id: string; isDeleted: boolean; organizationId: string };
      };
      expect(written.where).toEqual({
        id: campaignId,
        isDeleted: false,
        organizationId,
      });
      expect(written.data.config.rateLimits.currentHourCount).toBe(1);
      expect(written.data.config.rateLimits.currentDayCount).toBe(1);
      expect(written.data.config).toEqual(
        expect.objectContaining({
          totalReplies: 1,
          totalSuccessful: 1,
        }),
      );
    });

    it('grants at most one reservation when concurrent workers race the final slot', async () => {
      const row = makeRow({
        rateLimits: {
          currentDayCount: 9,
          currentHourCount: 9,
          maxPerDay: 10,
          maxPerHour: 10,
        },
      });
      let current = structuredClone(row);
      let chain = Promise.resolve();
      const prisma = {
        $transaction: vi.fn(),
        outreachCampaign: {
          findFirst: vi.fn(async () => structuredClone(current)),
          updateMany: vi.fn(
            async (args: {
              data: { config: Record<string, unknown> };
              where: { organizationId: string; status: string };
            }) => {
              if (
                current.isDeleted ||
                current.organizationId !== args.where.organizationId ||
                current.status !== args.where.status
              ) {
                return { count: 0 };
              }
              current = {
                ...current,
                config: args.data.config,
              };
              return { count: 1 };
            },
          ),
        },
      };
      prisma.$transaction.mockImplementation(
        (callback: (tx: typeof prisma) => Promise<unknown>) => {
          const run = chain.then(() => callback(prisma));
          chain = run.then(
            () => undefined,
            () => undefined,
          );
          return run;
        },
      );
      const service = new OutreachCampaignsService(
        prisma as unknown as PrismaService,
        {
          debug: vi.fn(),
          error: vi.fn(),
          log: vi.fn(),
          warn: vi.fn(),
        } as unknown as LoggerService,
      );

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          service.reserveReplySlot(campaignId, organizationId, now),
        ),
      );

      expect(results.filter((result) => result.reserved)).toHaveLength(1);
      expect(results.filter((result) => !result.reserved)).toHaveLength(7);
      const rateLimits = current.config.rateLimits as {
        currentDayCount: number;
        currentHourCount: number;
      };
      expect(rateLimits.currentHourCount).toBe(10);
      expect(rateLimits.currentDayCount).toBe(10);
    });
  });
});
