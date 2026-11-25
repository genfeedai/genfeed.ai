import { randomUUID } from 'node:crypto';
import { CustomerInstanceResolverService } from '@api/collections/customer-instances/customer-instance-resolver.service';
import { AdminCustomerInstancesService } from '@api/endpoints/admin/customer-instances/admin-customer-instances.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ManagedInferenceRuntimeService } from '@api/services/integrations/managed-inference-runtime/managed-inference-runtime.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { BadRequestException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: use an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.CUSTOMER_INSTANCES_TEST_DATABASE_URL;

/**
 * Real Prisma client and database. The operator route's whole purpose is that
 * a row it writes is the row `provider=genfeedai` later finds for that
 * organization and for no other, so the read side runs the real resolver and
 * the real gate (`hasDedicatedInstanceForOrg`) against the same tables.
 */
describe.skipIf(!connectionString)(
  'AdminCustomerInstancesService PostgreSQL',
  () => {
    const configService = {
      get: (key: string) =>
        ({ DATABASE_URL: connectionString, GENFEED_CLOUD: '1' })[
          key as 'DATABASE_URL' | 'GENFEED_CLOUD'
        ],
      mediaUrlConfig: { cdnUrl: 'https://cdn.test' },
    } as unknown as ConfigService;
    let prisma: PrismaService;
    let admin: AdminCustomerInstancesService;
    let runtime: ManagedInferenceRuntimeService;
    const setup = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    beforeAll(() => {
      prisma = new PrismaService(configService);
      admin = new AdminCustomerInstancesService(prisma);
      runtime = new ManagedInferenceRuntimeService(
        { error: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
        new CustomerInstanceResolverService(prisma),
      );
    });
    const database = () => {
      if (!setup) {
        throw new Error('CUSTOMER_INSTANCES_TEST_DATABASE_URL is required');
      }
      return setup;
    };

    let userId: string;
    let orgA: string;
    let orgB: string;

    const asOrg = <T>(organizationId: string, run: () => Promise<T>) =>
      runWithTenantContext({ organizationId }, run);

    beforeEach(async () => {
      const suffix = randomUUID();
      userId = `ci-user-${suffix}`;
      orgA = `ci-org-a-${suffix}`;
      orgB = `ci-org-b-${suffix}`;
      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });
      for (const id of [orgA, orgB]) {
        await db.organization.create({
          data: { id, label: id, slug: id, userId },
        });
      }
    });

    afterEach(async () => {
      const db = database();
      await db.customerInstance.deleteMany({
        where: { organizationId: { in: [orgA, orgB] } },
      });
      await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
      await db.user.deleteMany({ where: { id: userId } });
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      await setup?.$disconnect();
    });

    const running = {
      apiUrl: 'https://videos.customer-a.example.com',
      role: 'videos',
      status: 'running',
    } as const;

    it('a row created through the route is the instance provider=genfeedai finds for that organization, and for no other', async () => {
      const created = await asOrg(orgA, () =>
        admin.upsert(orgA, 'inst-1', running),
      );

      expect(created).toMatchObject({
        apiUrl: 'https://videos.customer-a.example.com',
        organizationId: orgA,
        reference: 'inst-1',
        role: 'videos',
        status: 'running',
      });
      await expect(
        asOrg(orgA, () => runtime.hasDedicatedInstanceForOrg(orgA, 'videos')),
      ).resolves.toBe(true);
      await expect(
        asOrg(orgB, () => runtime.hasDedicatedInstanceForOrg(orgB, 'videos')),
      ).resolves.toBe(false);
      await expect(
        asOrg(orgA, () => runtime.hasDedicatedInstanceForOrg(orgA, 'voices')),
      ).resolves.toBe(false);
    });

    it('a full instance serves every media role', async () => {
      await asOrg(orgA, () =>
        admin.upsert(orgA, 'inst-full', { ...running, role: 'full' }),
      );

      await expect(
        asOrg(orgA, () => runtime.hasDedicatedInstanceForOrg(orgA, 'voices')),
      ).resolves.toBe(true);
    });

    it('repeating a call updates the same row, and the instance is only found once it runs', async () => {
      await asOrg(orgA, () =>
        admin.upsert(orgA, 'inst-1', { ...running, status: 'provisioning' }),
      );
      await expect(
        asOrg(orgA, () => runtime.hasDedicatedInstanceForOrg(orgA, 'videos')),
      ).resolves.toBe(false);

      await asOrg(orgA, () => admin.upsert(orgA, 'inst-1', running));

      expect(
        await database().customerInstance.count({
          where: { isDeleted: false, organizationId: orgA },
        }),
      ).toBe(1);
      await expect(
        asOrg(orgA, () => runtime.hasDedicatedInstanceForOrg(orgA, 'videos')),
      ).resolves.toBe(true);
    });

    it('the same reference in two organizations is two separate rows', async () => {
      await asOrg(orgA, () => admin.upsert(orgA, 'shared-ref', running));
      await asOrg(orgB, () =>
        admin.upsert(orgB, 'shared-ref', {
          ...running,
          apiUrl: 'https://videos.customer-b.example.com',
        }),
      );

      const listA = await asOrg(orgA, () => admin.list(orgA));
      const listB = await asOrg(orgB, () => admin.list(orgB));

      expect(listA.map((row) => row.apiUrl)).toEqual([
        'https://videos.customer-a.example.com',
      ]);
      expect(listB.map((row) => row.apiUrl)).toEqual([
        'https://videos.customer-b.example.com',
      ]);
    });

    it('removing an instance stops it serving requests and a second removal is a 404', async () => {
      await asOrg(orgA, () => admin.upsert(orgA, 'inst-1', running));

      await asOrg(orgA, () => admin.remove(orgA, 'inst-1'));

      await expect(
        asOrg(orgA, () => runtime.hasDedicatedInstanceForOrg(orgA, 'videos')),
      ).resolves.toBe(false);
      expect(await asOrg(orgA, () => admin.list(orgA))).toEqual([]);
      await expect(
        asOrg(orgA, () => admin.remove(orgA, 'inst-1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('removing by reference never touches another organization', async () => {
      await asOrg(orgA, () => admin.upsert(orgA, 'inst-1', running));

      await expect(
        asOrg(orgB, () => admin.remove(orgB, 'inst-1')),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        asOrg(orgA, () => runtime.hasDedicatedInstanceForOrg(orgA, 'videos')),
      ).resolves.toBe(true);
    });

    it('refuses an address that points at a private network and stores nothing', async () => {
      await expect(
        asOrg(orgA, () =>
          admin.upsert(orgA, 'inst-1', {
            ...running,
            apiUrl: 'https://169.254.169.254',
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(
        await database().customerInstance.count({
          where: { organizationId: orgA },
        }),
      ).toBe(0);
    });

    it('refuses an organization that does not exist', async () => {
      await expect(
        asOrg('missing-org', () =>
          admin.upsert('missing-org', 'inst-1', running),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  },
);
