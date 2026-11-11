import { randomUUID } from 'node:crypto';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { AgentThreadAccessService } from '@api/collections/agent-threads/services/agent-thread-access.service';
import { AgentTransfersService } from '@api/collections/agent-transfers/services/agent-transfers.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { CollaborationAlertsService } from '@api/services/collaboration-alerts/collaboration-alerts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentMessageRole,
  AgentThreadKind,
  AgentThreadStatus,
  AgentTransferDeliveryMode,
  AgentTransferStatus,
  MemberRole,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));

// Explicit opt-in only: an isolated, fully migrated database, never
// DATABASE_URL. Rows are not cleaned up (transfers are immutable by trigger);
// every test uses fresh ids.
const connectionString = process.env.AGENT_MASTER_THREAD_TEST_DATABASE_URL;

/**
 * #9940: a task handed from one member's agent to another member's. The hand-off
 * is a request until the teammate accepts; the run is then queued as them, with
 * their principal, and never as the sender. A foreign organization or a member
 * without the brand is refused.
 */
describe.skipIf(!connectionString)(
  'a hand-off to a teammate PostgreSQL end-to-end (#9940)',
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

    let suffix: string;
    let organizationId: string;
    let brandA: string;
    let brandB: string;
    let ana: string;
    let marco: string;
    let sourceThreadId: string;

    const id = (label: string) => `${label}-${suffix}`;

    function makeService(accept: ReturnType<typeof vi.fn>) {
      const db = database() as unknown as PrismaService;
      const logger = { error: vi.fn(), warn: vi.fn() };
      return new AgentTransfersService(
        db,
        {} as never,
        { accept } as never,
        new AgentThreadAccessService(db, new BrandAccessService(db)),
        new CollaborationAlertsService(
          db,
          new ActivityRecorderService(
            db,
            { enqueue: vi.fn() } as never,
            { publishInboxUpdate: vi.fn() } as never,
            logger as never,
          ),
          logger as never,
        ),
      );
    }

    async function createMember(
      userId: string,
      brandIds: string[],
      roleKey = MemberRole.CREATOR,
    ) {
      await database().user.create({ data: { handle: userId, id: userId } });
      const role = await database().role.upsert({
        create: { key: roleKey, label: roleKey },
        update: {},
        where: { key: roleKey },
      });
      await database().member.create({
        data: {
          brands: { connect: brandIds.map((brand) => ({ id: brand })) },
          currentBrandId: brandIds[0] ?? brandA,
          organizationId,
          roleId: role.id,
          roleKey,
          userId,
        },
      });
    }

    /** A queued agent-turn execution the accepted hand-off is linked to. */
    async function createExecution(ownerId: string) {
      const db = database();
      const workflow = id(`wf-${randomUUID()}`);
      const version = id(`wfv-${randomUUID()}`);
      const execution = id(`exec-${randomUUID()}`);
      await db.$transaction(async (tx) => {
        await tx.workflow.create({
          data: {
            currentVersionId: version,
            id: workflow,
            organizationId,
            userId: ownerId,
          },
        });
        await tx.workflowVersion.create({
          data: {
            contentHash: 'sha256:v1:fixture',
            graph: { edges: [], lockedNodeIds: [], nodes: [] },
            id: version,
            organizationId,
            userId: ownerId,
            version: 1,
            workflowId: workflow,
          },
        });
      });
      await db.workflowExecution.create({
        data: {
          id: execution,
          organizationId,
          status: 'PENDING',
          userId: ownerId,
          workflowId: workflow,
          workflowVersionId: version,
        },
      });
      return execution;
    }

    const bellItems = (userId: string) =>
      database().notificationInboxItem.findMany({
        where: { organizationId, userId },
      });

    const handoff = (overrides: Record<string, unknown> = {}) => ({
      content: 'Review the queued post and tighten the hook.',
      deliveryMode: AgentTransferDeliveryMode.SEND_AND_RUN,
      destinationTitle: 'Review the queued post',
      destinationUserId: marco,
      explicitUserIntent: true,
      idempotencyKey: `handoff-${randomUUID()}`,
      sourceThreadId,
      ...overrides,
    });

    beforeEach(async () => {
      vi.clearAllMocks();
      suffix = randomUUID();
      ana = id('ana');
      marco = id('marco');
      organizationId = id('org');
      await database().user.create({ data: { handle: ana, id: ana } });
      await database().organization.create({
        data: {
          id: organizationId,
          label: organizationId,
          slug: organizationId,
          userId: ana,
        },
      });
      brandA = id('brand-a');
      brandB = id('brand-b');
      for (const brand of [brandA, brandB]) {
        await database().brand.create({
          data: {
            id: brand,
            label: brand,
            organizationId,
            slug: brand,
            userId: ana,
          },
        });
      }
      // Ana is a creator on both brands; Marco only reaches brand A.
      const role = await database().role.upsert({
        create: { key: MemberRole.CREATOR, label: MemberRole.CREATOR },
        update: {},
        where: { key: MemberRole.CREATOR },
      });
      await database().member.create({
        data: {
          brands: { connect: [{ id: brandA }, { id: brandB }] },
          currentBrandId: brandA,
          organizationId,
          roleId: role.id,
          roleKey: MemberRole.CREATOR,
          userId: ana,
        },
      });
      await createMember(marco, [brandA]);
      const source = await database().agentThread.create({
        data: {
          brandId: brandA,
          kind: AgentThreadKind.THREAD,
          organizationId,
          title: 'Weekly performance recap',
          userId: ana,
        },
      });
      sourceThreadId = source.id;
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('asks the teammate first: the request waits in a new thread of theirs and nothing runs', async () => {
      const accept = vi.fn();
      const service = makeService(accept);

      const transfer = await service.create(handoff(), {
        organizationId,
        userId: ana,
      });

      expect(transfer).toMatchObject({
        destinationUserId: marco,
        status: AgentTransferStatus.AWAITING_ACCEPTANCE,
        userId: ana,
      });
      expect(accept).not.toHaveBeenCalled();

      // One bell item tells Marco the request is waiting; Ana, who sent it, gets none.
      expect(await bellItems(marco)).toEqual([
        expect.objectContaining({
          readAt: null,
          topic: 'collaboration.activity',
        }),
      ]);
      expect(await bellItems(ana)).toEqual([]);

      const thread = await database().agentThread.findUniqueOrThrow({
        where: { id: transfer.destinationThreadId },
      });
      expect(thread).toMatchObject({
        brandId: brandA,
        kind: AgentThreadKind.THREAD,
        parentThreadId: null,
        status: AgentThreadStatus.ACTIVE,
        userId: marco,
      });

      // Marco sees the request in his own thread; Ana cannot read his thread.
      const asMarco = await service.listForThread(
        { organizationId, userId: marco },
        thread.id,
      );
      expect(asMarco.map((row) => row.id)).toEqual([transfer.id]);
      const note = await database().agentMessage.findMany({
        where: { organizationId, threadId: thread.id },
      });
      expect(note).toEqual([
        expect.objectContaining({
          role: AgentMessageRole.SYSTEM,
          userId: marco,
        }),
      ]);
      await expect(
        service.listForThread({ organizationId, userId: ana }, thread.id),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('runs the accepted hand-off as the teammate, never as the sender', async () => {
      const executionId = await createExecution(marco);
      const accept = vi.fn(async () => ({
        executionId,
        queuedAt: new Date().toISOString(),
      }));
      const service = makeService(accept);
      const created = await service.create(handoff(), {
        organizationId,
        userId: ana,
      });
      const principal = {
        isApiKey: false,
        organizationId,
        scopes: [],
        userId: marco,
      };

      const accepted = await service.accept(created.id, {
        initiatingPrincipal: principal,
        organizationId,
        userId: marco,
      });

      expect(accept).toHaveBeenCalledTimes(1);
      const [request, context] = accept.mock.calls[0] as unknown as [
        { content: string; threadId: string },
        {
          initiatingPrincipal: unknown;
          organizationId: string;
          userId: string;
        },
      ];
      expect(request).toMatchObject({
        content: 'Review the queued post and tighten the hook.',
        threadId: created.destinationThreadId,
      });
      expect(context).toEqual({
        initiatingPrincipal: principal,
        organizationId,
        userId: marco,
      });
      expect(accepted).toMatchObject({
        destinationExecutionId: executionId,
        status: AgentTransferStatus.QUEUED,
      });
      // Only the first answer counts.
      await expect(
        service.accept(created.id, { organizationId, userId: marco }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.decline(created.id, { organizationId, userId: marco }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lets the teammate decline: nothing runs and the sender is told', async () => {
      const accept = vi.fn();
      const service = makeService(accept);
      const created = await service.create(handoff(), {
        organizationId,
        userId: ana,
      });

      const declined = await service.decline(created.id, {
        organizationId,
        userId: marco,
      });

      expect(declined.status).toBe(AgentTransferStatus.DECLINED);
      expect(accept).not.toHaveBeenCalled();
      const archived = await database().agentThread.findUniqueOrThrow({
        where: { id: created.destinationThreadId },
      });
      expect(archived.status).toBe(AgentThreadStatus.ARCHIVED);
      const toldSender = await database().agentMessage.findMany({
        where: {
          organizationId,
          role: AgentMessageRole.SYSTEM,
          threadId: sourceThreadId,
        },
      });
      expect(toldSender.map((message) => message.content)).toContain(
        'Review the queued post was declined.',
      );
      await expect(
        service.accept(created.id, { organizationId, userId: marco }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('answers only to the teammate it was sent to', async () => {
      const service = makeService(vi.fn());
      const created = await service.create(handoff(), {
        organizationId,
        userId: ana,
      });

      for (const answer of ['accept', 'decline'] as const) {
        await expect(
          service[answer](created.id, { organizationId, userId: ana }),
        ).rejects.toMatchObject({ status: 404 });
      }
      await expect(
        service.retry(created.id, { organizationId, userId: ana }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a teammate who lacks the thread brand, a stranger and another organization', async () => {
      const service = makeService(vi.fn());
      // Marco has no access to brand B.
      const brandBSource = await database().agentThread.create({
        data: {
          brandId: brandB,
          kind: AgentThreadKind.THREAD,
          organizationId,
          userId: ana,
        },
      });
      await expect(
        service.create(handoff({ sourceThreadId: brandBSource.id }), {
          organizationId,
          userId: ana,
        }),
      ).rejects.toMatchObject({ status: 404 });

      await expect(
        service.create(handoff({ destinationUserId: id('nobody') }), {
          organizationId,
          userId: ana,
        }),
      ).rejects.toMatchObject({ status: 404 });

      // The same user id, asked for from another organization, is a stranger.
      const otherOrganizationId = id('other-org');
      await database().organization.create({
        data: {
          id: otherOrganizationId,
          label: otherOrganizationId,
          slug: otherOrganizationId,
          userId: ana,
        },
      });
      await expect(
        service.create(handoff(), {
          organizationId: otherOrganizationId,
          userId: ana,
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('lists only teammates who reach the thread brand', async () => {
      const service = makeService(vi.fn());
      const brandBSource = await database().agentThread.create({
        data: {
          brandId: brandB,
          kind: AgentThreadKind.THREAD,
          organizationId,
          userId: ana,
        },
      });

      await expect(
        service.discoverTeammates(
          { organizationId, userId: ana },
          sourceThreadId,
        ),
      ).resolves.toEqual([{ name: marco, userId: marco }]);
      await expect(
        service.discoverTeammates(
          { organizationId, userId: ana },
          brandBSource.id,
        ),
      ).resolves.toEqual([]);
    });

    it('requires SEND_AND_RUN, a new thread and the sender confirmation', async () => {
      const service = makeService(vi.fn());
      const actor = { organizationId, userId: ana };

      await expect(
        service.create(
          handoff({ deliveryMode: AgentTransferDeliveryMode.SEND }),
          actor,
        ),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.create(handoff({ destinationThreadId: sourceThreadId }), actor),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.create(handoff({ explicitUserIntent: false }), actor),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('does not start a run when the sender repeats the request', async () => {
      const accept = vi.fn();
      const service = makeService(accept);
      const request = handoff();

      const first = await service.create(request, {
        organizationId,
        userId: ana,
      });
      const again = await service.create(request, {
        organizationId,
        userId: ana,
      });

      expect(again.id).toBe(first.id);
      expect(accept).not.toHaveBeenCalled();
      expect(await bellItems(marco)).toHaveLength(1);
    });
  },
);
