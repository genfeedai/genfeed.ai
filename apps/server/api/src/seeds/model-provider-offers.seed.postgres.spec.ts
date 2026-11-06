import { randomUUID } from 'node:crypto';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type Prisma, PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  seedProviderOfferAssociations,
  seedProviderOfferRegistrations,
} from './model-provider-offers.seed';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

class RolledBack<T> extends Error {
  constructor(readonly result: T) {
    super('rolled back');
  }
}

/**
 * The provider-offer reference-data sync against real Prisma and PostgreSQL.
 * Every case runs inside one transaction that is rolled back, so the global
 * model keys the sync writes never leak into other suites.
 */
describe.skipIf(!connectionString)(
  'model provider offer reference-data sync (PostgreSQL)',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    /** Runs `body` on a client whose writes, nested transactions included, are rolled back. */
    async function inRolledBackDatabase<T>(
      body: (db: Prisma.TransactionClient, seed: PrismaService) => Promise<T>,
    ): Promise<T> {
      if (!prisma) {
        throw new Error('BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL is required');
      }
      try {
        await prisma.$transaction(async (tx) => {
          const seed = new Proxy(tx, {
            get: (target, property, receiver) =>
              property === '$transaction'
                ? (callback: (client: Prisma.TransactionClient) => unknown) =>
                    callback(target)
                : Reflect.get(target, property, receiver),
          }) as unknown as PrismaService;
          throw new RolledBack(await body(tx, seed));
        });
      } catch (error) {
        if (error instanceof RolledBack) {
          return error.result as T;
        }
        throw error;
      }
      throw new Error('The rollback transaction committed');
    }

    function klingRegistration(db: Prisma.TransactionClient) {
      return Promise.all([
        db.providerRoutingSetting.findUnique({
          select: { isActive: true },
          where: { provider: 'kie' },
        }),
        db.model.findUnique({
          select: {
            isActive: true,
            isProviderVariant: true,
            isPublic: true,
            provider: true,
          },
          where: { key: 'kie/kling-3.0' },
        }),
      ]);
    }

    it('registers Kie and its Kling model once, with the provider off', async () => {
      const result = await inRolledBackDatabase(async (db, seed) => ({
        first: await seedProviderOfferRegistrations(seed),
        second: await seedProviderOfferRegistrations(seed),
        state: await klingRegistration(db),
      }));

      expect(result).toEqual({
        first: 2,
        second: 0,
        state: [
          { isActive: false },
          {
            isActive: true,
            isProviderVariant: true,
            isPublic: false,
            provider: 'kie',
          },
        ],
      });
    });

    it('keeps the switches an operator already set', async () => {
      const result = await inRolledBackDatabase(async (db, seed) => {
        await db.providerRoutingSetting.create({
          data: { isActive: true, provider: 'kie' },
        });
        await db.model.create({
          data: {
            category: 'video',
            endpoint: 'kling-3.0/video',
            isActive: false,
            isProviderVariant: true,
            isPublic: false,
            key: 'kie/kling-3.0',
            label: 'Kling 3.0 · Kie.ai',
            provider: 'kie',
          },
        });
        return {
          written: await seedProviderOfferRegistrations(seed),
          state: await klingRegistration(db),
        };
      });

      expect(result).toEqual({
        written: 0,
        state: [
          { isActive: true },
          {
            isActive: false,
            isProviderVariant: true,
            isPublic: false,
            provider: 'kie',
          },
        ],
      });
    });

    /** The Replicate Kling model, Kie's copy of it, and an org that enabled Kie's copy. */
    async function klingPair(
      db: Prisma.TransactionClient,
      execution: { isDefault: boolean; isProviderVariant: boolean },
    ) {
      const suffix = randomUUID();
      const userId = `offer-user-${suffix}`;
      const organizationId = `offer-org-${suffix}`;
      await db.user.create({ data: { handle: userId, id: userId } });
      await db.organization.create({
        data: {
          id: organizationId,
          label: 'Offers',
          slug: organizationId,
          userId,
        },
      });
      const logical = await db.model.create({
        data: {
          category: 'video',
          endpoint: 'kwaivgi/kling-v3-video',
          key: 'kwaivgi/kling-v3-video',
          label: 'Kling v3',
          provider: 'replicate',
        },
      });
      const source = await db.model.create({
        data: {
          category: 'video',
          endpoint: 'kling-3.0/video',
          key: 'kie/kling-3.0',
          label: 'Kling 3.0 · Kie.ai',
          provider: 'kie',
          ...execution,
        },
      });
      await db.organizationSetting.create({
        data: { enabledModelIds: ['kie/kling-3.0'], organizationId },
      });
      return { logical, organizationId, source };
    }

    async function klingAssociation(
      db: Prisma.TransactionClient,
      pair: Awaited<ReturnType<typeof klingPair>>,
    ) {
      const [offers, models, setting] = await Promise.all([
        db.modelProviderOffer.findMany({
          orderBy: { priority: 'asc' },
          select: { executionModelId: true, isActive: true, priority: true },
          where: { modelId: pair.logical.id },
        }),
        db.model.findMany({
          orderBy: { key: 'asc' },
          select: { isDefault: true, isProviderVariant: true, key: true },
          where: { id: { in: [pair.logical.id, pair.source.id] } },
        }),
        db.organizationSetting.findUnique({
          select: { enabledModelIds: true },
          where: { organizationId: pair.organizationId },
        }),
      ]);
      return {
        models,
        offers: offers.map((offer) => ({
          ...offer,
          executionModelId:
            offer.executionModelId === pair.logical.id ? 'logical' : 'source',
        })),
        setting,
      };
    }

    it('offers the catalog model through its provider copy and hands over the default and grants', async () => {
      const result = await inRolledBackDatabase(async (db, seed) => {
        const pair = await klingPair(db, {
          isDefault: true,
          isProviderVariant: false,
        });
        return {
          first: await seedProviderOfferAssociations(seed),
          second: await seedProviderOfferAssociations(seed),
          state: await klingAssociation(db, pair),
        };
      });

      expect(result).toEqual({
        first: 3,
        second: 0,
        state: {
          models: [
            {
              isDefault: false,
              isProviderVariant: true,
              key: 'kie/kling-3.0',
            },
            {
              isDefault: true,
              isProviderVariant: false,
              key: 'kwaivgi/kling-v3-video',
            },
          ],
          offers: expect.arrayContaining([
            { executionModelId: 'logical', isActive: true, priority: 0 },
            { executionModelId: 'source', isActive: true, priority: 0 },
          ]),
          setting: {
            enabledModelIds: ['kie/kling-3.0', 'kwaivgi/kling-v3-video'],
          },
        },
      });
    });

    it('leaves an offer an operator disabled as it is', async () => {
      const result = await inRolledBackDatabase(async (db, seed) => {
        const pair = await klingPair(db, {
          isDefault: false,
          isProviderVariant: true,
        });
        await db.modelProviderOffer.createMany({
          data: [
            {
              executionModelId: pair.logical.id,
              modelId: pair.logical.id,
              priority: 1,
            },
            {
              executionModelId: pair.source.id,
              isActive: false,
              modelId: pair.logical.id,
              priority: 4,
            },
          ],
        });
        return {
          written: await seedProviderOfferAssociations(seed),
          state: await klingAssociation(db, pair),
        };
      });

      expect(result).toEqual({
        written: 0,
        state: {
          models: [
            {
              isDefault: false,
              isProviderVariant: true,
              key: 'kie/kling-3.0',
            },
            {
              isDefault: false,
              isProviderVariant: false,
              key: 'kwaivgi/kling-v3-video',
            },
          ],
          offers: [
            { executionModelId: 'logical', isActive: true, priority: 1 },
            { executionModelId: 'source', isActive: false, priority: 4 },
          ],
          setting: { enabledModelIds: ['kie/kling-3.0'] },
        },
      });
    });
  },
);
