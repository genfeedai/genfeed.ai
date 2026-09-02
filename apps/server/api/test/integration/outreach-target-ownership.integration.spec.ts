/**
 * Real-Postgres proof that outreach targets are tenant-owned, JSON-hydrated,
 * and claimed with a scoped CAS (#3405).
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

import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
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
  CampaignDiscoverySource,
  CampaignPlatform,
  CampaignStatus,
  CampaignTargetStatus,
  CampaignTargetType,
  CampaignType,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('Outreach target ownership (real Postgres, #3405)', () => {
  let moduleRef: TestingModule;
  let dbHelper: TestDatabaseHelper;
  let prisma: PrismaService;
  let service: CampaignTargetsService;

  beforeAll(async () => {
    const moduleConfig = await E2ETestModule.forRoot();
    moduleRef = await Test.createTestingModule({
      imports: [moduleConfig],
    }).compile();

    dbHelper = createTestDatabaseHelper(moduleRef);
    prisma = moduleRef.get(PrismaService);
    service = new CampaignTargetsService(prisma, {
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
    await prisma.campaignTarget.deleteMany();
    await prisma.outreachCampaign.deleteMany();
    await dbHelper.clearDatabase();
  });

  async function seedCampaign(options?: {
    organizationId?: string;
    status?: CampaignStatus;
  }): Promise<{ campaignId: string; organizationId: string }> {
    const organizationId = options?.organizationId ?? generateIdString();
    const campaignId = generateIdString();

    await dbHelper.seedCollection('organizations', [
      createTestOrganization({ id: organizationId }),
    ]);

    await prisma.outreachCampaign.create({
      data: {
        campaignType: CampaignType.MANUAL,
        config: { totalTargets: 0 },
        id: campaignId,
        isActive: true,
        isDeleted: false,
        organizationId,
        platform: CampaignPlatform.TWITTER,
        status: options?.status ?? CampaignStatus.ACTIVE,
      },
    });

    return { campaignId, organizationId };
  }

  it('derives organization from the parent campaign and keeps totalTargets transactional', async () => {
    const { campaignId, organizationId } = await seedCampaign();

    const added = await service.createManyForCampaign(
      campaignId,
      organizationId,
      [
        {
          campaignId,
          contentUrl: 'https://x.com/u/status/1',
          discoverySource: CampaignDiscoverySource.MANUAL,
          externalId: 'ext-1',
          organizationId: generateIdString(),
          platform: CampaignPlatform.TWITTER,
          recipientUserId: 'user-9',
          dmText: 'hello',
          targetType: CampaignTargetType.TWEET,
        },
      ],
    );

    expect(added).toBe(1);
    const target = await prisma.campaignTarget.findFirst({
      where: { campaignId, organizationId, isDeleted: false },
    });
    const campaign = await prisma.outreachCampaign.findFirst({
      where: { id: campaignId },
    });
    const hydrated = await service.findById(
      target?.id ?? '',
      organizationId,
      campaignId,
    );

    expect(target?.organizationId).toBe(organizationId);
    const campaignConfig = (campaign?.config ?? {}) as {
      totalTargets?: number;
    };
    expect(campaignConfig.totalTargets).toBe(1);
    expect(hydrated?.recipientUserId).toBe('user-9');
    expect(hydrated?.dmText).toBe('hello');
  });

  it('returns nothing and changes zero rows for a foreign organization', async () => {
    const { campaignId, organizationId } = await seedCampaign();
    await service.createManyForCampaign(campaignId, organizationId, [
      {
        campaignId,
        contentUrl: 'https://x.com/u/status/1',
        discoverySource: CampaignDiscoverySource.MANUAL,
        externalId: 'ext-1',
        organizationId,
        platform: CampaignPlatform.TWITTER,
        targetType: CampaignTargetType.TWEET,
      },
    ]);
    const target = await prisma.campaignTarget.findFirst({
      where: { campaignId },
    });

    await expect(
      service.findById(target?.id ?? '', generateIdString()),
    ).resolves.toBeNull();
    await expect(
      service.claimForProcessing(target?.id ?? '', generateIdString()),
    ).resolves.toBeNull();
    expect(
      await prisma.campaignTarget.findFirst({ where: { id: target?.id } }),
    ).toMatchObject({ status: CampaignTargetStatus.PENDING });
  });

  it('grants one CAS claim and allows terminal bookkeeping after pause', async () => {
    const { campaignId, organizationId } = await seedCampaign();
    await service.createManyForCampaign(campaignId, organizationId, [
      {
        campaignId,
        contentUrl: 'https://x.com/u/status/1',
        discoverySource: CampaignDiscoverySource.MANUAL,
        externalId: 'ext-1',
        organizationId,
        platform: CampaignPlatform.TWITTER,
        targetType: CampaignTargetType.TWEET,
      },
    ]);
    const target = await prisma.campaignTarget.findFirst({
      where: { campaignId },
    });
    const targetId = target?.id ?? '';

    const claims = await Promise.all(
      Array.from({ length: 4 }, () =>
        service.claimForProcessing(targetId, organizationId),
      ),
    );

    expect(claims.filter(Boolean)).toHaveLength(1);

    await prisma.outreachCampaign.updateMany({
      data: { status: CampaignStatus.PAUSED },
      where: { id: campaignId, organizationId },
    });

    const replied = await service.markAsReplied(targetId, organizationId, {
      replyExternalId: 'reply-1',
      replyText: 'thanks',
      replyUrl: 'https://x.com/r/1',
    });

    expect(replied?.status).toBe(CampaignTargetStatus.REPLIED);
    await expect(
      service.getPendingTargets(campaignId, organizationId),
    ).resolves.toEqual([]);
  });
});
