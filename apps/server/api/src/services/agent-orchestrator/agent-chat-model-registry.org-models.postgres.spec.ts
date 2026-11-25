import { randomUUID } from 'node:crypto';
import { RetiredModelException } from '@api/helpers/exceptions/retired-model/retired-model.exception';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import {
  AGENT_CHAT_CAPABILITY,
  DEFAULT_AGENT_CHAT_MODEL_KEY,
} from '@genfeedai/contracts/constants';
import { PrismaClient } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
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
const connectionString = process.env.AGENT_CHAT_REGISTRY_TEST_DATABASE_URL;

/**
 * Real Prisma client and database, CLOUD tenant guard on. The registry is a
 * process-wide cache of platform rows; a text model attached to one
 * organization has to be visible, resolvable and priced for that organization
 * and for no other, including through a stored override.
 */
describe.skipIf(!connectionString)(
  'AgentChatModelRegistryService organization text models (PostgreSQL)',
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
        throw new Error('AGENT_CHAT_REGISTRY_TEST_DATABASE_URL is required');
      }
      return setup;
    };

    let prisma: PrismaService;
    let registry: AgentChatModelRegistryService;
    let userId: string;
    let orgA: string;
    let orgB: string;
    let ownKey: string;

    beforeAll(() => {
      prisma = new PrismaService(configService);
    });

    beforeEach(async () => {
      const suffix = randomUUID();
      userId = `reg-user-${suffix}`;
      orgA = `reg-org-a-${suffix}`;
      orgB = `reg-org-b-${suffix}`;
      ownKey = `dedicated/model-${suffix}`;
      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });
      for (const id of [orgA, orgB]) {
        await db.organization.create({
          data: { id, label: id, slug: id, userId },
        });
      }
      registry = new AgentChatModelRegistryService(prisma, {
        warn: vi.fn(),
      } as unknown as LoggerService);
    });

    afterEach(async () => {
      const db = database();
      await db.model.deleteMany({
        where: { organizationId: { in: [orgA, orgB] } },
      });
      await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
      await db.user.deleteMany({ where: { id: userId } });
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      await setup?.$disconnect();
    });

    const createOwnModel = (
      fields: { lifecycle?: ModelLifecycle; organizationId?: string } = {},
    ) =>
      database().model.create({
        data: {
          capabilities: [AGENT_CHAT_CAPABILITY],
          category: ModelCategory.TEXT,
          cost: 7,
          endpoint: 'https://example.invalid',
          inputCostPerMillionTokens: 1,
          key: ownKey,
          label: 'Dedicated model',
          lifecycle: fields.lifecycle ?? ModelLifecycle.AVAILABLE,
          organizationId: fields.organizationId ?? orgA,
          outputCostPerMillionTokens: 2,
          provider: 'genfeedai',
        },
      });

    it('lists an organization text model for that organization only', async () => {
      await createOwnModel();

      const keysFor = async (organizationId?: string) =>
        (await registry.listSelectable(organizationId)).map((row) => row.key);

      expect(await keysFor(orgA)).toContain(ownKey);
      expect(await keysFor(orgB)).not.toContain(ownKey);
      expect(await keysFor()).not.toContain(ownKey);
    });

    it('resolves a stored override to the organization model for its owner and to the platform default for another organization', async () => {
      await createOwnModel();

      await expect(
        registry.resolveOverrideModelKey(ownKey, orgA),
      ).resolves.toBe(ownKey);
      await expect(
        registry.resolveOverrideModelKey(ownKey, orgB),
      ).resolves.toBe(DEFAULT_AGENT_CHAT_MODEL_KEY);
      await expect(registry.resolveOverrideModelKey(ownKey)).resolves.toBe(
        DEFAULT_AGENT_CHAT_MODEL_KEY,
      );
    });

    it('prices a round on the organization model for its owner only', async () => {
      await createOwnModel();

      await expect(registry.getRoundCredits(ownKey, orgA)).resolves.toBe(7);
      expect(await registry.getRoundCredits(ownKey, orgB)).not.toBe(7);

      const round = {
        completionTokens: 1_000_000,
        promptTokens: 1_000_000,
        requestedModel: ownKey,
      };
      await expect(
        registry.calculateRoundProviderCostUsd({
          ...round,
          organizationId: orgA,
        }),
      ).resolves.toBe(3);
      expect(
        await registry.calculateRoundProviderCostUsd({
          ...round,
          organizationId: orgB,
        }),
      ).not.toBe(3);
    });

    it('stops a stored reference to a retired organization model for its owner', async () => {
      await createOwnModel({ lifecycle: ModelLifecycle.RETIRED });

      await expect(
        registry.resolveOverrideModelKey(ownKey, orgA),
      ).rejects.toBeInstanceOf(RetiredModelException);
      await expect(
        registry.resolveOverrideModelKey(ownKey, orgB),
      ).resolves.toBe(DEFAULT_AGENT_CHAT_MODEL_KEY);
    });

    it('never offers an organization model as the platform default', async () => {
      await createOwnModel();
      await database().model.update({
        data: { isDefault: true },
        where: { key: ownKey },
      });

      await expect(registry.getDefaultModelKey()).resolves.not.toBe(ownKey);
    });
  },
);
