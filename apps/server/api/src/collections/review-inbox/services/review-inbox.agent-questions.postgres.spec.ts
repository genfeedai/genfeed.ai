import { randomUUID } from 'node:crypto';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { AgentThreadAccessService } from '@api/collections/agent-threads/services/agent-thread-access.service';
import { AgentThreadSharesService } from '@api/collections/agent-threads/services/agent-thread-shares.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { ReviewInboxService } from '@api/collections/review-inbox/services/review-inbox.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentThreadKind,
  AgentThreadShareLevel,
  AgentThreadShareScope,
  AgentThreadStatus,
  MemberRole,
} from '@genfeedai/contracts';
import type { IReviewInboxItem } from '@genfeedai/contracts/interfaces';
import { PrismaClient } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));

// Explicit opt-in only: an isolated, fully migrated database, never
// DATABASE_URL. Every test uses fresh ids and rows are not cleaned up.
const connectionString = process.env.AGENT_MASTER_THREAD_TEST_DATABASE_URL;

/**
 * #10896: a question an agent run waits on shows in the review inbox of every
 * member who can open its thread, and of no one else. The access rules, the
 * marker the thread engine keeps with the pending list, and the removal on an
 * answer or a cancelled run are shown against a real database: a mocked client
 * cannot prove a revoked share or a brand assignment stops the row.
 */
describe.skipIf(!connectionString)(
  'review inbox agent questions PostgreSQL end-to-end (#10896)',
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
    const brandAccess = () =>
      new BrandAccessService(database() as unknown as PrismaService);
    const threadAccess = () =>
      new AgentThreadAccessService(
        database() as unknown as PrismaService,
        brandAccess(),
      );
    const shares = () =>
      new AgentThreadSharesService(
        database() as unknown as PrismaService,
        threadAccess(),
        brandAccess(),
        { refresh: async () => null } as never,
      );
    const engine = () =>
      new AgentThreadEngineService(
        database() as unknown as PrismaService,
        new AgentThreadsService(
          database() as unknown as PrismaService,
          logger as never,
          {} as never,
        ),
        {} as never,
        // Runtime bindings are not what is under test.
        {
          markCancelled: vi.fn().mockResolvedValue(undefined),
          upsertBinding: vi.fn().mockResolvedValue(undefined),
        } as never,
        new AgentThreadProjectorService(),
        logger as never,
        undefined,
        undefined,
        threadAccess(),
      );
    const inbox = () =>
      new ReviewInboxService(
        database() as unknown as PrismaService,
        brandAccess(),
        {} as never,
        { cdnUrl: 'https://cdn.example.com/' } as unknown as ConfigService,
        threadAccess(),
      );

    let suffix: string;
    let organizationId: string;
    let brandA: string;
    let brandB: string;
    let owner: string;
    let teammate: string;
    let brandBOnly: string;

    const id = (label: string) => `${label}-${suffix}`;

    async function createMember(
      userId: string,
      brandIds: string[],
      orgId = organizationId,
    ) {
      await database().user.create({ data: { handle: userId, id: userId } });
      const role = await database().role.upsert({
        create: { key: MemberRole.CREATOR, label: MemberRole.CREATOR },
        update: {},
        where: { key: MemberRole.CREATOR },
      });
      await database().member.create({
        data: {
          brands: { connect: brandIds.map((brandId) => ({ id: brandId })) },
          currentBrandId: brandIds[0],
          organizationId: orgId,
          roleId: role.id,
          roleKey: MemberRole.CREATOR,
          userId,
        },
      });
    }

    async function createThread(userId: string, brandId: string | null) {
      return database().agentThread.create({
        data: {
          brandId,
          kind: AgentThreadKind.THREAD,
          organizationId,
          title: 'Launch week',
          userId,
        },
      });
    }

    async function ask(
      threadId: string,
      requestId = 'req-tone',
      runId = 'run-1',
      userId = owner,
    ) {
      await engine().appendEvent({
        commandId: `ask:${threadId}:${requestId}`,
        organizationId,
        payload: {
          allowFreeText: true,
          options: [
            { description: 'Light and fun', id: 'playful', label: 'Playful' },
            { id: 'formal', label: 'Formal' },
          ],
          prompt: 'Which tone should the launch posts use?',
          requestId,
          title: 'Pick a tone',
        },
        runId,
        threadId,
        type: 'input.requested',
        userId,
      });
    }

    async function listFor(userId: string): Promise<IReviewInboxItem[]> {
      const actor = { organizationId, userId };
      const scope = await brandAccess().resolve(actor);
      return inbox().listPending(
        { organizationId },
        {
          actor,
          brandIds: scope.brandIds,
          canResolveMcpApprovals: false,
          canResolveWorkflowGates: false,
        },
      );
    }

    const grant = (
      threadId: string,
      targetUserId: string,
      level: AgentThreadShareLevel,
    ) =>
      shares().grant({ organizationId, userId: owner }, threadId, {
        level,
        scope: AgentThreadShareScope.MEMBER,
        targetUserId,
      });

    beforeEach(async () => {
      vi.clearAllMocks();
      suffix = randomUUID();
      owner = id('owner');
      teammate = id('teammate');
      brandBOnly = id('brand-b-only');
      await database().user.create({ data: { handle: owner, id: owner } });
      organizationId = randomUUID();
      await database().organization.create({
        data: {
          id: organizationId,
          label: organizationId,
          slug: organizationId,
          userId: owner,
        },
      });
      [brandA, brandB] = [id('brand-a'), id('brand-b')];
      for (const brandId of [brandA, brandB]) {
        await database().brand.create({
          data: {
            id: brandId,
            label: brandId,
            organizationId,
            slug: brandId,
            userId: owner,
          },
        });
      }
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
          userId: owner,
        },
      });
      await createMember(teammate, [brandA, brandB]);
      await createMember(brandBOnly, [brandB]);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("lists the owner's question with what answering it needs", async () => {
      const thread = await createThread(owner, brandA);
      await ask(thread.id);

      const items = await listFor(owner);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        actionTitle: 'Pick a tone',
        brandId: brandA,
        id: `agent_input_request:${thread.id}:req-tone`,
        isResolvable: true,
        kind: 'agent_input_request',
        question: {
          allowFreeText: true,
          isMultiSelect: false,
          options: [
            {
              description: 'Light and fun',
              id: 'playful',
              label: 'Playful',
            },
            { description: null, id: 'formal', label: 'Formal' },
          ],
          prompt: 'Which tone should the launch posts use?',
          requestId: 'req-tone',
          threadId: thread.id,
        },
        source: 'agent',
        sourceLabel: 'Launch week',
      });
    });

    it('marks the snapshot while a question is pending and clears it once none is', async () => {
      const thread = await createThread(owner, brandA);
      const pendingAt = () =>
        database()
          .agentThreadSnapshot.findFirst({
            where: { organizationId, threadId: thread.id },
          })
          .then((snapshot) => snapshot?.pendingInputAt ?? null);
      expect(await pendingAt()).toBeNull();

      await ask(thread.id);
      expect(await pendingAt()).toBeInstanceOf(Date);

      await engine().resolveInputRequest({
        answer: 'Playful',
        organizationId,
        requestId: 'req-tone',
        threadId: thread.id,
        userId: owner,
      });
      expect(await pendingAt()).toBeNull();
    });

    it('lists the newest question and leaves out one it superseded', async () => {
      const thread = await createThread(owner, brandA);
      await ask(thread.id, 'req-tone');
      await ask(thread.id, 'req-length');

      const items = await listFor(owner);

      expect(items.map((item) => item.question?.requestId)).toEqual([
        'req-length',
      ]);
      // Every listed question can be answered through the thread's route.
      await expect(
        engine().resolveInputRequest({
          answer: 'Short',
          organizationId,
          requestId: 'req-length',
          threadId: thread.id,
          userId: owner,
        }),
      ).resolves.toBeDefined();
      await expect(
        engine().resolveInputRequest({
          answer: 'Playful',
          organizationId,
          requestId: 'req-tone',
          threadId: thread.id,
          userId: owner,
        }),
      ).rejects.toThrow();
      // Nothing is left to wait on, so the thread leaves the inbox's index.
      const snapshot = await database().agentThreadSnapshot.findFirst({
        where: { organizationId, threadId: thread.id },
      });
      expect(snapshot?.pendingInputAt).toBeNull();
    });

    it('keeps the marker with the pending list when a profile snapshot is written', async () => {
      const thread = await createThread(owner, brandA);
      await ask(thread.id);
      const row = () =>
        database().agentThreadSnapshot.findFirst({
          where: { organizationId, threadId: thread.id },
        });
      const before = (await row())?.pendingInputAt;

      await engine().recordProfileSnapshot(thread.id, organizationId, owner, {
        label: 'Launch agent',
      });

      const after = await row();
      expect(before).toBeInstanceOf(Date);
      expect(after?.pendingInputAt).toBeInstanceOf(Date);
      const data = (after?.data ?? {}) as { pendingInputRequests?: unknown[] };
      expect(data.pendingInputRequests).toHaveLength(1);
      expect(await listFor(owner)).toHaveLength(1);
    });

    it('shows a question only to members who can open the thread', async () => {
      const thread = await createThread(owner, brandA);
      await ask(thread.id);

      expect(await listFor(teammate)).toEqual([]);

      const viewShare = await grant(
        thread.id,
        teammate,
        AgentThreadShareLevel.VIEW,
      );
      const [viewRow] = await listFor(teammate);
      expect(viewRow).toMatchObject({
        id: `agent_input_request:${thread.id}:req-tone`,
        isResolvable: false,
      });

      await shares().revoke(
        { organizationId, userId: owner },
        thread.id,
        viewShare.id,
      );
      expect(await listFor(teammate)).toEqual([]);

      await grant(thread.id, teammate, AgentThreadShareLevel.COLLABORATE);
      const [collaborateRow] = await listFor(teammate);
      expect(collaborateRow?.isResolvable).toBe(true);
    });

    it('hides the questions of another brand from a brand-limited member', async () => {
      const brandAThread = await createThread(brandBOnly, brandA);
      await ask(brandAThread.id, 'req-brand-a', 'run-1', brandBOnly);
      const brandBThread = await createThread(brandBOnly, brandB);
      await ask(brandBThread.id, 'req-brand-b', 'run-1', brandBOnly);

      const items = await listFor(brandBOnly);

      expect(items.map((item) => item.brandId)).toEqual([brandB]);
    });

    it('removes the question once it is answered', async () => {
      const thread = await createThread(owner, brandA);
      await ask(thread.id);
      await engine().resolveInputRequest({
        answer: 'Formal',
        optionIds: ['formal'],
        organizationId,
        requestId: 'req-tone',
        threadId: thread.id,
        userId: owner,
      });

      expect(await listFor(owner)).toEqual([]);
    });

    it('removes the question when its run is cancelled', async () => {
      const thread = await createThread(owner, brandA);
      await ask(thread.id, 'req-tone', 'run-9');
      await engine().appendEvent({
        commandId: `cancel:${thread.id}`,
        organizationId,
        runId: 'run-9',
        threadId: thread.id,
        type: 'run.cancelled',
        userId: owner,
      });

      expect(await listFor(owner)).toEqual([]);
    });

    it('leaves out archived threads', async () => {
      const thread = await createThread(owner, brandA);
      await ask(thread.id);
      await database().agentThread.update({
        data: { status: AgentThreadStatus.ARCHIVED },
        where: { id: thread.id },
      });

      expect(await listFor(owner)).toEqual([]);
    });
  },
);
