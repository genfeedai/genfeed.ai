import { randomUUID } from 'node:crypto';
import type { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentMasterThreadService } from '@api/collections/agent-threads/services/agent-master-thread.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { AgentTransferExecutionListener } from '@api/collections/agent-transfers/listeners/agent-transfer-execution.listener';
import { AgentTransfersService } from '@api/collections/agent-transfers/services/agent-transfers.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentMessageRole,
  AgentThreadKind,
  AgentThreadStatus,
  AgentTransferDeliveryMode,
  AgentTransferStatus,
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
    const makeTransfersService = (turnAcceptance: unknown = {}) =>
      new AgentTransfersService(
        database() as unknown as PrismaService,
        {} as never,
        turnAcceptance as never,
      );
    const makeListener = () =>
      new AgentTransferExecutionListener(
        database() as unknown as PrismaService,
        logger as never,
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

    describe('child results reach the master (#8527)', () => {
      const SUMMARY = 'Three launch posts are drafted and waiting for review.';

      /** A queued agent-turn execution, as `startDestinationRun` would see it. */
      async function createExecution(status: 'COMPLETED' | 'PENDING') {
        const db = database();
        const workflow = `master-wf-${randomUUID()}`;
        const version = `master-wfv-${randomUUID()}`;
        const execution = `master-exec-${randomUUID()}`;
        // The current-version foreign key is deferred, so the workflow goes first.
        await db.$transaction(async (tx) => {
          await tx.workflow.create({
            data: {
              currentVersionId: version,
              id: workflow,
              organizationId,
              userId,
            },
          });
          await tx.workflowVersion.create({
            data: {
              contentHash: 'sha256:v1:fixture',
              graph: { edges: [], lockedNodeIds: [], nodes: [] },
              id: version,
              organizationId,
              userId,
              version: 1,
              workflowId: workflow,
            },
          });
        });
        await db.workflowExecution.create({
          data: {
            id: execution,
            organizationId,
            status,
            userId,
            workflowId: workflow,
            workflowVersionId: version,
            ...(status === 'COMPLETED' ? finishedFields() : {}),
          },
        });
        return execution;
      }

      function finishedFields() {
        return {
          completedAt: new Date(),
          progress: 100,
          result: {
            artifactReferences: [],
            artifactVersionPinIds: [],
            summary: SUMMARY,
          },
          startedAt: new Date(Date.now() - 1000),
        };
      }

      async function startRun(executionId: string) {
        const master = await makeMasterService().getOrCreate(
          userId,
          organizationId,
        );
        const accept = vi.fn(async () => ({
          executionId,
          queuedAt: new Date().toISOString(),
        }));
        const transfer = await makeTransfersService({ accept }).create(
          {
            content: 'Draft three launch posts.',
            deliveryMode: AgentTransferDeliveryMode.SEND_AND_RUN,
            destinationTitle: 'Launch posts',
            explicitUserIntent: true,
            idempotencyKey: `master-run-${randomUUID()}`,
            sourceThreadId: master.id,
          } as never,
          { organizationId, userId },
        );
        return { master, transfer };
      }

      const resultMessages = (masterId: string) =>
        database().agentMessage.findMany({
          where: {
            organizationId,
            role: AgentMessageRole.SYSTEM,
            threadId: masterId,
          },
        });

      it('completes the transfer and tells the master when the child finishes later', async () => {
        const executionId = await createExecution('PENDING');
        const { master, transfer } = await startRun(executionId);
        await database().workflowExecution.update({
          data: { ...finishedFields(), status: 'COMPLETED' },
          where: { id: executionId },
        });

        await makeListener().handleExecutionTerminal({
          executionId,
          organizationId,
          status: 'completed',
        });

        const row = await database().agentTransfer.findUniqueOrThrow({
          where: { id: transfer.id },
        });
        expect(row).toMatchObject({
          completionSummary: SUMMARY,
          progress: 100,
          status: AgentTransferStatus.COMPLETED,
        });
        expect(row.completedAt).not.toBeNull();
        const messages = await resultMessages(master.id);
        // The outbound marker written when the transfer was created has no
        // result metadata; the result message is the one that does.
        const results = messages.filter(
          (message) =>
            (message.metadata as { agentTransferResult?: unknown } | null)
              ?.agentTransferResult,
        );
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
          content: `Launch posts finished.\n\n${SUMMARY}`,
          metadata: {
            agentTransferResult: {
              destinationThreadId: transfer.destinationThreadId,
              status: AgentTransferStatus.COMPLETED,
              transferId: transfer.id,
            },
          },
        });
      });

      it('writes the result once however often the terminal event arrives', async () => {
        const executionId = await createExecution('PENDING');
        const { master } = await startRun(executionId);
        await database().workflowExecution.update({
          data: { ...finishedFields(), status: 'COMPLETED' },
          where: { id: executionId },
        });
        const listener = makeListener();
        const event = {
          executionId,
          organizationId,
          status: 'completed',
        } as const;

        await Promise.all([
          listener.handleExecutionTerminal(event),
          listener.handleExecutionTerminal(event),
          listener.handleExecutionTerminal(event),
        ]);

        const results = (await resultMessages(master.id)).filter(
          (message) =>
            (message.metadata as { agentTransferResult?: unknown } | null)
              ?.agentTransferResult,
        );
        expect(results).toHaveLength(1);
      });

      it('settles at once when the child already ended before it was acknowledged', async () => {
        const executionId = await createExecution('COMPLETED');

        const { master, transfer } = await startRun(executionId);

        expect(transfer).toMatchObject({
          completionSummary: SUMMARY,
          status: AgentTransferStatus.COMPLETED,
        });
        const results = (await resultMessages(master.id)).filter(
          (message) =>
            (message.metadata as { agentTransferResult?: unknown } | null)
              ?.agentTransferResult,
        );
        expect(results).toHaveLength(1);
        // The late terminal event does not add a second message.
        await makeListener().handleExecutionTerminal({
          executionId,
          organizationId,
          status: 'completed',
        });
        expect(
          (await resultMessages(master.id)).filter(
            (message) =>
              (message.metadata as { agentTransferResult?: unknown } | null)
                ?.agentTransferResult,
          ),
        ).toHaveLength(1);
      });

      it('reports a failed child to the master with the reason', async () => {
        const executionId = await createExecution('PENDING');
        const { master, transfer } = await startRun(executionId);
        await database().workflowExecution.update({
          data: {
            completedAt: new Date(),
            error: 'Insufficient credits.',
            status: 'FAILED',
          },
          where: { id: executionId },
        });

        await makeListener().handleExecutionTerminal({
          executionId,
          organizationId,
          status: 'failed',
        });

        const row = await database().agentTransfer.findUniqueOrThrow({
          where: { id: transfer.id },
        });
        expect(row).toMatchObject({
          failureReason: 'Insufficient credits.',
          status: AgentTransferStatus.FAILED,
        });
        const results = (await resultMessages(master.id)).filter(
          (message) =>
            (message.metadata as { agentTransferResult?: unknown } | null)
              ?.agentTransferResult,
        );
        expect(results.map((message) => message.content)).toEqual([
          'Launch posts failed: Insufficient credits.',
        ]);
      });

      it('ignores an execution that belongs to no transfer', async () => {
        const executionId = await createExecution('COMPLETED');

        await expect(
          makeListener().handleExecutionTerminal({
            executionId,
            organizationId,
            status: 'completed',
          }),
        ).resolves.toBeUndefined();
        expect(logger.error).not.toHaveBeenCalled();
      });
    });
  },
);
