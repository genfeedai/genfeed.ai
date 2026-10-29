import { randomUUID } from 'node:crypto';
import type { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentMasterThreadService } from '@api/collections/agent-threads/services/agent-master-thread.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { AgentTransfersService } from '@api/collections/agent-transfers/services/agent-transfers.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentThreadKind,
  AgentThreadStatus,
  AgentTransferDeliveryMode,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: an isolated, fully migrated database, never
// DATABASE_URL. Skipped unless `AGENT_MASTER_THREAD_TEST_DATABASE_URL` is set.
// Rows are not cleaned up: agent transfers are immutable by trigger, and the
// database is disposable. Every test uses fresh ids.
const connectionString = process.env.AGENT_MASTER_THREAD_TEST_DATABASE_URL;

const PAGE = { limit: 50, page: 1, skip: 0 };

/**
 * #8526: one master thread per (organization, user), created on first open.
 * The guarantee is the partial unique index, so it is proved against a real
 * database: a mocked Prisma client cannot race two inserts.
 */
describe.skipIf(!connectionString)(
  'agent master threads PostgreSQL end-to-end (#8526)',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma) {
        throw new Error('AGENT_MASTER_THREAD_TEST_DATABASE_URL is required');
      }
      return prisma;
    };

    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    const makeThreadsService = () =>
      new AgentThreadsService(
        database() as unknown as PrismaService,
        logger as never,
        {} as AgentMessagesService,
      );
    const makeMasterService = () =>
      new AgentMasterThreadService(
        database() as unknown as PrismaService,
        makeThreadsService(),
      );
    const makeTransfersService = () =>
      new AgentTransfersService(
        database() as unknown as PrismaService,
        {} as never,
        {} as never,
      );

    let suffix: string;
    let userId: string;
    let organizationId: string;

    async function createUser(id: string) {
      await database().user.create({ data: { handle: id, id } });
    }

    async function createOrganization(id: string, ownerId: string) {
      await database().organization.create({
        data: { id, label: id, slug: id, userId: ownerId },
      });
    }

    beforeEach(async () => {
      vi.clearAllMocks();
      suffix = randomUUID();
      userId = `master-user-${suffix}`;
      organizationId = `master-org-${suffix}`;
      await createUser(userId);
      await createOrganization(organizationId, userId);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('creates exactly one master when many first opens race', async () => {
      const service = makeMasterService();
      const callers = 8;
      // Hold every caller at its first lookup until all of them have looked,
      // so each one sees "no master yet" and every insert really races. The
      // retry lookups after a lost insert pass through to the database.
      const lookup = service as unknown as {
        findMasterThread: (
          userId: string,
          organizationId: string,
        ) => Promise<unknown>;
      };
      const realLookup = lookup.findMasterThread.bind(service);
      let arrived = 0;
      let release: () => void = () => undefined;
      const allArrived = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.spyOn(lookup, 'findMasterThread').mockImplementation(
        async (...args) => {
          if (arrived >= callers) {
            return realLookup(...args);
          }
          arrived += 1;
          if (arrived === callers) {
            release();
          }
          await allArrived;
          return null;
        },
      );

      const opened = await Promise.all(
        Array.from({ length: callers }, () =>
          service.getOrCreate(userId, organizationId),
        ),
      );

      expect(new Set(opened.map((thread) => thread.id)).size).toBe(1);
      const rows = await database().agentThread.findMany({
        where: { kind: AgentThreadKind.MASTER, organizationId, userId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        brandId: null,
        isDeleted: false,
        kind: AgentThreadKind.MASTER,
        parentThreadId: null,
        status: AgentThreadStatus.ACTIVE,
      });
    });

    it('returns the same master on every later open', async () => {
      const service = makeMasterService();

      const first = await service.getOrCreate(userId, organizationId);
      const second = await service.getOrCreate(userId, organizationId);

      expect(second.id).toBe(first.id);
    });

    it('keeps one master per user and one per organization', async () => {
      const service = makeMasterService();
      const otherUserId = `master-other-user-${suffix}`;
      const otherOrganizationId = `master-other-org-${suffix}`;
      await createUser(otherUserId);
      await createOrganization(otherOrganizationId, userId);

      const ids = await Promise.all([
        service.getOrCreate(userId, organizationId),
        service.getOrCreate(otherUserId, organizationId),
        service.getOrCreate(userId, otherOrganizationId),
      ]).then((threads) => threads.map((thread) => thread.id));

      expect(new Set(ids).size).toBe(3);
    });

    it('rejects a second live master at the database', async () => {
      const db = database();
      await db.agentThread.create({
        data: { kind: AgentThreadKind.MASTER, organizationId, userId },
      });

      await expect(
        db.agentThread.create({
          data: { kind: AgentThreadKind.MASTER, organizationId, userId },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      // A plain thread is not limited.
      await db.agentThread.create({ data: { organizationId, userId } });
      await db.agentThread.create({ data: { organizationId, userId } });
    });

    it('rejects a kind outside master and thread', async () => {
      await expect(
        database().agentThread.create({
          data: { kind: 'orchestrator', organizationId, userId },
        }),
      ).rejects.toThrow();
    });

    it('opens a fresh master once the old one is soft deleted', async () => {
      const service = makeMasterService();
      const first = await service.getOrCreate(userId, organizationId);
      await database().agentThread.update({
        data: { isDeleted: true },
        where: { id: first.id },
      });

      const second = await service.getOrCreate(userId, organizationId);

      expect(second.id).not.toBe(first.id);
      expect(second.isDeleted).toBe(false);
    });

    it('leaves the master active when the user archives all threads', async () => {
      const service = makeThreadsService();
      const masters = makeMasterService();
      const master = await masters.getOrCreate(userId, organizationId);
      await database().agentThread.create({ data: { organizationId, userId } });

      const archivedCount = await service.archiveAllThreads(
        userId,
        organizationId,
      );

      expect(archivedCount).toBe(1);
      const row = await database().agentThread.findUniqueOrThrow({
        where: { id: master.id },
      });
      expect(row.status).toBe(AgentThreadStatus.ACTIVE);
    });

    it('sets the parent on a thread spawned from the master and lists children by parent', async () => {
      const threads = makeThreadsService();
      const master = await makeMasterService().getOrCreate(
        userId,
        organizationId,
      );
      const unrelated = await database().agentThread.create({
        data: { organizationId, userId },
      });

      const transfer = await makeTransfersService().create(
        {
          content: 'Draft three launch posts.',
          deliveryMode: AgentTransferDeliveryMode.SEND,
          destinationTitle: 'Launch posts',
          idempotencyKey: `master-transfer-${suffix}`,
          sourceThreadId: master.id,
        } as never,
        { organizationId, userId },
      );

      const child = await database().agentThread.findUniqueOrThrow({
        where: { id: transfer.destinationThreadId },
      });
      expect(child).toMatchObject({
        kind: AgentThreadKind.THREAD,
        parentThreadId: master.id,
        source: 'agent-transfer',
      });

      const children = await threads.getUserThreads(
        userId,
        organizationId,
        undefined,
        undefined,
        undefined,
        PAGE,
        { parentThreadId: master.id },
      );
      expect(children.docs.map((thread) => thread.id)).toEqual([child.id]);

      const masters = await threads.getUserThreads(
        userId,
        organizationId,
        undefined,
        undefined,
        undefined,
        PAGE,
        { kind: AgentThreadKind.MASTER },
      );
      expect(masters.docs.map((thread) => thread.id)).toEqual([master.id]);

      const everything = await threads.getUserThreads(
        userId,
        organizationId,
        undefined,
        undefined,
        undefined,
        PAGE,
      );
      expect(everything.docs.map((thread) => thread.id).sort()).toEqual(
        [master.id, child.id, unrelated.id].sort(),
      );
    });

    it('rejects a destination brand that differs from the existing destination thread', async () => {
      const db = database();
      const brands = await Promise.all(
        ['a', 'b'].map((key) =>
          db.brand.create({
            data: {
              label: `Brand ${key}`,
              organizationId,
              slug: `master-brand-${key}-${suffix}`,
            },
          }),
        ),
      );
      const master = await makeMasterService().getOrCreate(
        userId,
        organizationId,
      );
      const destination = await db.agentThread.create({
        data: { brandId: brands[0]?.id, organizationId, userId },
      });
      const request = (destinationBrandId: string, key: string) =>
        makeTransfersService().create(
          {
            content: 'Draft three launch posts.',
            deliveryMode: AgentTransferDeliveryMode.SEND,
            destinationBrandId,
            destinationThreadId: destination.id,
            idempotencyKey: `master-brand-${key}-${suffix}`,
            sourceThreadId: master.id,
          } as never,
          { organizationId, userId },
        );

      await expect(request(brands[1]?.id ?? '', 'b')).rejects.toMatchObject({
        status: 400,
      });
      const accepted = await request(brands[0]?.id ?? '', 'a');
      expect(accepted.destinationBrandId).toBe(brands[0]?.id);
    });

    it('cannot parent a thread to a thread of another organization', async () => {
      const db = database();
      const otherOrganizationId = `master-foreign-org-${suffix}`;
      await createOrganization(otherOrganizationId, userId);
      const foreign = await db.agentThread.create({
        data: { organizationId: otherOrganizationId, userId },
      });

      await expect(
        db.agentThread.create({
          data: { organizationId, parentThreadId: foreign.id, userId },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });
  },
);
