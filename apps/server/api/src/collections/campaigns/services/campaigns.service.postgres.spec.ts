import { randomUUID } from 'node:crypto';
import { CampaignsService } from '@api/collections/campaigns/services/campaigns.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { assertIsolatedDatabaseUrl } from '@api-test/../scripts/assert-isolated-db-url';
import { PrismaClient } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

const configuredUrl = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;
const connectionString = configuredUrl
  ? assertIsolatedDatabaseUrl(configuredUrl)
  : undefined;

describe.skipIf(!connectionString)(
  'Campaign creative context PostgreSQL',
  () => {
    let module: TestingModule;
    let db: PrismaClient;
    let service: CampaignsService;
    let organizationId: string;
    let otherOrganizationId: string;
    let brandId: string;
    let otherBrandId: string;
    let userId: string;
    let assetId: string;
    const scoped = <T>(call: () => Promise<T>) =>
      runWithTenantContext({ organizationId }, call);

    beforeAll(async () => {
      db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
      module = await Test.createTestingModule({
        providers: [
          PrismaService,
          CampaignsService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string) => {
                if (key === 'DATABASE_URL') return connectionString;
                if (key === 'GENFEED_CLOUD') return '1';
                return undefined;
              },
              mediaUrlConfig: { cdnUrl: 'https://cdn.test' },
            },
          },
        ],
      }).compile();
      service = module.get(CampaignsService);
    });

    beforeEach(async () => {
      const suffix = randomUUID();
      userId = `campaign-pg-user-${suffix}`;
      organizationId = `campaign-pg-org-${suffix}`;
      otherOrganizationId = `campaign-pg-other-${suffix}`;
      brandId = `campaign-pg-brand-${suffix}`;
      otherBrandId = `campaign-pg-brand-other-${suffix}`;
      assetId = `campaign-pg-asset-${suffix}`;
      await db.user.create({ data: { id: userId, handle: userId } });
      for (const id of [organizationId, otherOrganizationId]) {
        await db.organization.create({
          data: { id, slug: id, label: id, userId },
        });
      }
      for (const [id, orgId] of [
        [brandId, organizationId],
        [otherBrandId, otherOrganizationId],
      ]) {
        await db.brand.create({
          data: { id, slug: id, label: id, userId, organizationId: orgId },
        });
      }
      await db.ingredient.create({
        data: { id: assetId, brandId, organizationId, userId },
      });
    });

    afterEach(async () => {
      const scope = {
        organizationId: { in: [organizationId, otherOrganizationId] },
      };
      await db.campaign.deleteMany({ where: scope });
      await db.ingredient.deleteMany({ where: scope });
      await db.brand.deleteMany({ where: scope });
      await db.organization.deleteMany({
        where: { id: { in: [organizationId, otherOrganizationId] } },
      });
      await db.user.deleteMany({ where: { id: userId } });
    });

    afterAll(async () => {
      await module?.get(PrismaService).$disconnect();
      await module?.close();
      await db?.$disconnect();
    });

    it('persists context and Library membership and updates only the selected brand', async () => {
      const created = await scoped(() =>
        service.create(organizationId, userId, {
          brandId,
          name: 'Launch',
          audience: 'Small teams',
          tone: 'Candid',
          creativeDirection: 'Show the corrections',
          assetIds: [assetId],
        }),
      );
      expect(
        await scoped(() => service.getOne(organizationId, created.id, brandId)),
      ).toMatchObject({
        id: created.id,
        audience: 'Small teams',
        tone: 'Candid',
        assetIds: [assetId],
      });
      await expect(
        scoped(() =>
          service.update(
            organizationId,
            created.id,
            { tone: 'Wrong brand' },
            otherBrandId,
          ),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await scoped(() =>
        service.update(
          organizationId,
          created.id,
          { tone: null, assetIds: [] },
          brandId,
        ),
      );
      expect(
        await db.campaign.findUniqueOrThrow({ where: { id: created.id } }),
      ).toMatchObject({
        tone: null,
        assetIds: [],
        audience: 'Small teams',
      });
    });

    it('rejects foreign and deleted Library assets before persistence', async () => {
      await db.ingredient.update({
        where: { id: assetId },
        data: { isDeleted: true },
      });
      await expect(
        scoped(() =>
          service.create(organizationId, userId, {
            brandId,
            name: 'Deleted asset',
            assetIds: [assetId],
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await db.ingredient.update({
        where: { id: assetId },
        data: {
          isDeleted: false,
          organizationId: otherOrganizationId,
          brandId: otherBrandId,
        },
      });
      await expect(
        scoped(() =>
          service.create(organizationId, userId, {
            brandId,
            name: 'Foreign asset',
            assetIds: [assetId],
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await db.campaign.count({ where: { organizationId } })).toBe(0);
    });

    it('returns one durable campaign for concurrent idempotent retries', async () => {
      const input = {
        brandId,
        name: 'One launch',
        idempotencyKey: randomUUID(),
      };
      const rows = await Promise.all([
        scoped(() => service.create(organizationId, userId, input)),
        scoped(() => service.create(organizationId, userId, input)),
      ]);
      expect(rows[0].id).toBe(rows[1].id);
      expect(await db.campaign.count({ where: { organizationId } })).toBe(1);
      await expect(
        runWithTenantContext({ organizationId: otherOrganizationId }, () =>
          service.getOne(otherOrganizationId, rows[0].id, otherBrandId),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  },
);
