import { randomUUID } from 'node:crypto';
import { CustomerInstancesService } from '@api/collections/customer-instances/services/customer-instances.service';
import { AdminCustomerInstancesService } from '@api/endpoints/admin/customer-instances/admin-customer-instances.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { DedicatedTextRouteService } from '@api/services/integrations/llm/dedicated-text-route.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { AGENT_CHAT_CAPABILITY } from '@genfeedai/contracts/constants';
import { PrismaClient } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { ServiceUnavailableException } from '@nestjs/common';
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
const connectionString = process.env.DEDICATED_TEXT_ROUTE_TEST_DATABASE_URL;

/**
 * Real Prisma client and database, CLOUD tenant guard on. An operator attaches
 * an `llm` instance to an organization through the admin service, the
 * organization owns a Genfeed AI text model, and the route resolves for that
 * organization only and fails closed when the instance is not running.
 */
describe.skipIf(!connectionString)(
  'DedicatedTextRouteService (PostgreSQL)',
  () => {
    const configService = {
      get: (key: string) =>
        ({ DATABASE_URL: connectionString, GENFEED_CLOUD: '1' })[
          key as 'DATABASE_URL' | 'GENFEED_CLOUD'
        ],
      mediaUrlConfig: { cdnUrl: 'https://cdn.test' },
    } as unknown as ConfigService;
    const setup = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!setup) {
        throw new Error('DEDICATED_TEXT_ROUTE_TEST_DATABASE_URL is required');
      }
      return setup;
    };

    let prisma: PrismaService;
    let admin: AdminCustomerInstancesService;
    let route: DedicatedTextRouteService;
    let userId: string;
    let orgA: string;
    let orgB: string;
    let modelKey: string;

    const asOrg = <T>(organizationId: string, run: () => Promise<T>) =>
      runWithTenantContext({ organizationId }, run);
    const attach = (
      organizationId: string,
      fields: {
        role?: 'llm' | 'videos' | 'full';
        status?: 'running' | 'stopped';
      },
    ) =>
      asOrg(organizationId, () =>
        admin.upsert(organizationId, 'text-instance', {
          apiUrl: 'https://llm.org-a.example.com',
          role: fields.role ?? 'llm',
          status: fields.status ?? 'running',
        }),
      );

    beforeAll(() => {
      prisma = new PrismaService(configService);
      const logger = {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService;
      admin = new AdminCustomerInstancesService(prisma);
      route = new DedicatedTextRouteService(
        logger,
        new AgentChatModelRegistryService(prisma, logger),
        new CustomerInstancesService(prisma, logger),
      );
    });

    beforeEach(async () => {
      const suffix = randomUUID();
      userId = `route-user-${suffix}`;
      orgA = `route-org-a-${suffix}`;
      orgB = `route-org-b-${suffix}`;
      modelKey = `dedicated/model-${suffix}`;
      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });
      for (const id of [orgA, orgB]) {
        await db.organization.create({
          data: { id, label: id, slug: id, userId },
        });
      }
      await db.model.create({
        data: {
          capabilities: [AGENT_CHAT_CAPABILITY],
          category: ModelCategory.TEXT,
          cost: 7,
          endpoint: 'https://example.invalid',
          externalId: 'org-model-8b',
          inputCostPerMillionTokens: 1,
          key: modelKey,
          label: 'Dedicated model',
          organizationId: orgA,
          outputCostPerMillionTokens: 2,
          provider: ModelProvider.GENFEED_AI,
        },
      });
    });

    afterEach(async () => {
      const db = database();
      await db.model.deleteMany({
        where: { organizationId: { in: [orgA, orgB] } },
      });
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

    it('routes the owner to the instance an operator attached, and nobody else', async () => {
      await attach(orgA, {});

      await expect(
        asOrg(orgA, () => route.resolve(orgA, modelKey)),
      ).resolves.toEqual({
        apiUrl: 'https://llm.org-a.example.com',
        upstreamModel: 'org-model-8b',
      });
      await expect(
        asOrg(orgB, () => route.resolve(orgB, modelKey)),
      ).resolves.toBeNull();
    });

    it('does not use another organization instance, even one that runs', async () => {
      await attach(orgB, {});

      await expect(
        asOrg(orgA, () => route.resolve(orgA, modelKey)),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it.each([
      ['a stopped instance', { status: 'stopped' as const }],
      ['a media instance', { role: 'videos' as const }],
      ['a full media instance', { role: 'full' as const }],
    ])('fails closed with %s', async (_name, fields) => {
      await attach(orgA, fields);

      await expect(
        asOrg(orgA, () => route.resolve(orgA, modelKey)),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('fails closed once the instance is removed', async () => {
      await attach(orgA, {});
      await asOrg(orgA, () => admin.remove(orgA, 'text-instance'));

      await expect(
        asOrg(orgA, () => route.resolve(orgA, modelKey)),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  },
);
