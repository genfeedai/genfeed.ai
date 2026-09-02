/**
 * Real-Postgres proof that outreach reply-slot reservation is atomic across
 * hourly and daily windows (#3409).
 *
 * Concurrent workers race `OutreachCampaignsService.reserveReplySlot` against
 * a disposable campaign row. Serializable transactions + scoped updateMany
 * must grant no more reservations than remaining capacity.
 */

type SkippableSuiteFn = (name: string, fn: () => void | Promise<void>) => void;
type SkippableSuite = SkippableSuiteFn & { skip?: SkippableSuiteFn };
interface GlobalWithTestOverrides {
  describe: SkippableSuiteFn;
  it: SkippableSuiteFn;
  test: SkippableSuiteFn;
}

if (process.env.SKIP_PRISMA_DB === 'true') {
  const g = global as unknown as GlobalWithTestOverrides;
  const originalDescribe = describe as unknown as SkippableSuite;
  const originalIt = it as unknown as SkippableSuite;
  g.describe = (name, fn) =>
    originalDescribe.skip
      ? originalDescribe.skip(name, fn)
      : describe(name, fn);
  g.it = (name, fn) =>
    originalIt.skip ? originalIt.skip(name, fn) : it(name, fn);
  g.test = g.it;
}

import {
  createTestOrganization,
  generateIdString,
} from '@api-test/e2e/e2e-test.utils';
import type { TestDatabaseHelper } from '@api-test/e2e-test.module';
import {
  createTestDatabaseHelper,
  E2ETestModule,
} from '@api-test/e2e-test.module';
import {
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';

type StoredRateLimits = {
  currentDayCount?: number;
  currentHourCount?: number;
  dayResetAt?: string;
  hourResetAt?: string;
  maxPerDay?: number;
  maxPerHour?: number;
};

describe('Outreach reply-slot reservation (real Postgres, #3409)', () => {
  let moduleRef: TestingModule;
  let dbHelper: TestDatabaseHelper;
  let prisma: PrismaService;
  let service: OutreachCampaignsService;

  const now = new Date('2026-08-24T12:00:00.000Z');

  beforeAll(async () => {
    const moduleConfig = await E2ETestModule.forRoot();
    moduleRef = await Test.createTestingModule({
      imports: [moduleConfig],
    }).compile();

    dbHelper = createTestDatabaseHelper(moduleRef);
    prisma = moduleRef.get(PrismaService);
    service = new OutreachCampaignsService(prisma, {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    // Targets reference campaigns, so they have to go first — a sibling suite in
    // the same serial tier can leave rows behind and the campaign delete then
    // trips the campaign_targets foreign key.
    await prisma.campaignTarget.deleteMany();
    await prisma.outreachCampaign.deleteMany();
    await dbHelper.clearDatabase();
  });

  async function seedCampaign(options: {
    currentDayCount: number;
    currentHourCount: number;
    maxPerDay: number;
    maxPerHour: number;
    organizationId?: string;
    status?: CampaignStatus;
  }): Promise<{ campaignId: string; organizationId: string }> {
    const organizationId = options.organizationId ?? generateIdString();
    const campaignId = generateIdString();

    await dbHelper.seedCollection('organizations', [
      createTestOrganization({ id: organizationId }),
    ]);

    await prisma.outreachCampaign.create({
      data: {
        campaignType: CampaignType.MANUAL,
        config: {
          rateLimits: {
            currentDayCount: options.currentDayCount,
            currentHourCount: options.currentHourCount,
            dayResetAt: new Date(now.getTime() + 86400 * 1000).toISOString(),
            hourResetAt: new Date(now.getTime() + 3600 * 1000).toISOString(),
            maxPerDay: options.maxPerDay,
            maxPerHour: options.maxPerHour,
          },
        },
        id: campaignId,
        isActive: true,
        isDeleted: false,
        organizationId,
        platform: CampaignPlatform.TWITTER,
        status: options.status ?? CampaignStatus.ACTIVE,
      },
    });

    return { campaignId, organizationId };
  }

  async function readRateLimits(
    campaignId: string,
  ): Promise<StoredRateLimits | undefined> {
    const row = await prisma.outreachCampaign.findFirst({
      where: { id: campaignId },
    });
    const config = (row?.config ?? {}) as {
      rateLimits?: StoredRateLimits;
    };
    return config.rateLimits;
  }

  it('grants one success and N-1 denials when workers race the final slot', async () => {
    const { campaignId, organizationId } = await seedCampaign({
      currentDayCount: 9,
      currentHourCount: 9,
      maxPerDay: 10,
      maxPerHour: 10,
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service.reserveReplySlot(campaignId, organizationId, now),
      ),
    );

    expect(results.filter((result) => result.reserved)).toHaveLength(1);
    expect(results.filter((result) => !result.reserved)).toHaveLength(7);

    const rateLimits = await readRateLimits(campaignId);
    expect(rateLimits?.currentHourCount).toBe(10);
    expect(rateLimits?.currentDayCount).toBe(10);
  });

  it('grants no more than remaining capacity when several slots are open', async () => {
    const { campaignId, organizationId } = await seedCampaign({
      currentDayCount: 1,
      currentHourCount: 1,
      maxPerDay: 50,
      maxPerHour: 3,
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service.reserveReplySlot(campaignId, organizationId, now),
      ),
    );

    expect(results.filter((result) => result.reserved)).toHaveLength(2);
    const rateLimits = await readRateLimits(campaignId);
    expect(rateLimits?.currentHourCount).toBe(3);
    expect(rateLimits?.currentDayCount).toBe(3);
  });

  it('keeps a consumed slot after a follow-up reservation attempt', async () => {
    const { campaignId, organizationId } = await seedCampaign({
      currentDayCount: 0,
      currentHourCount: 0,
      maxPerDay: 1,
      maxPerHour: 1,
    });

    await expect(
      service.reserveReplySlot(campaignId, organizationId, now),
    ).resolves.toEqual({ reserved: true });
    await expect(
      service.reserveReplySlot(campaignId, organizationId, now),
    ).resolves.toEqual({ reserved: false });

    const rateLimits = await readRateLimits(campaignId);
    expect(rateLimits?.currentHourCount).toBe(1);
    expect(rateLimits?.currentDayCount).toBe(1);
  });

  it('reserves zero slots for paused, deleted, or foreign campaigns', async () => {
    const paused = await seedCampaign({
      currentDayCount: 0,
      currentHourCount: 0,
      maxPerDay: 10,
      maxPerHour: 10,
      status: CampaignStatus.PAUSED,
    });
    await expect(
      service.reserveReplySlot(paused.campaignId, paused.organizationId, now),
    ).resolves.toEqual({ reserved: false });

    const owned = await seedCampaign({
      currentDayCount: 0,
      currentHourCount: 0,
      maxPerDay: 10,
      maxPerHour: 10,
    });
    await prisma.outreachCampaign.update({
      data: { isDeleted: true },
      where: { id: owned.campaignId },
    });
    await expect(
      service.reserveReplySlot(owned.campaignId, owned.organizationId, now),
    ).resolves.toEqual({ reserved: false });

    const relocated = await seedCampaign({
      currentDayCount: 0,
      currentHourCount: 0,
      maxPerDay: 10,
      maxPerHour: 10,
    });
    await expect(
      service.reserveReplySlot(relocated.campaignId, generateIdString(), now),
    ).resolves.toEqual({ reserved: false });

    const relocatedLimits = await readRateLimits(relocated.campaignId);
    expect(relocatedLimits?.currentHourCount).toBe(0);
    expect(relocatedLimits?.currentDayCount).toBe(0);
  });
});
