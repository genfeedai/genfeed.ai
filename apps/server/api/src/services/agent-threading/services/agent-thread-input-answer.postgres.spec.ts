import { randomUUID } from 'node:crypto';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { AgentThreadAccessService } from '@api/collections/agent-threads/services/agent-thread-access.service';
import { AgentThreadSharesService } from '@api/collections/agent-threads/services/agent-thread-shares.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentThreadKind,
  AgentThreadShareLevel,
  AgentThreadShareScope,
  MemberRole,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentThreadEngineService } from './agent-thread-engine.service';
import { AgentThreadProjectorService } from './agent-thread-projector.service';

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
 * #9964: a member with a live collaborate share answers the agent's pending
 * question in a thread another member owns. The answer, who gave it and the
 * refusal for a view-only or lapsed share are shown against a real database.
 */
describe.skipIf(!connectionString)(
  'answering a pending agent question in a shared thread PostgreSQL end-to-end (#9964)',
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
    const access = () =>
      new AgentThreadAccessService(
        database() as unknown as PrismaService,
        brandAccess(),
      );
    const shares = () =>
      new AgentThreadSharesService(
        database() as unknown as PrismaService,
        access(),
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
        { upsertBinding: vi.fn().mockResolvedValue(undefined) } as never,
        new AgentThreadProjectorService(),
        logger as never,
        undefined,
        undefined,
        access(),
      );

    let suffix: string;
    let organizationId: string;
    let brandA: string;
    let owner: string;
    let member: string;

    const id = (label: string) => `${label}-${suffix}`;

    async function createUserMember(userId: string) {
      await database().user.create({ data: { handle: userId, id: userId } });
      const role = await database().role.upsert({
        create: { key: MemberRole.CREATOR, label: MemberRole.CREATOR },
        update: {},
        where: { key: MemberRole.CREATOR },
      });
      await database().member.create({
        data: {
          brands: { connect: [{ id: brandA }] },
          currentBrandId: brandA,
          organizationId,
          roleId: role.id,
          roleKey: MemberRole.CREATOR,
          userId,
        },
      });
    }

    /** A thread owned by `owner`, shared with `member`, with one open question. */
    async function createThreadWithQuestion(level: AgentThreadShareLevel) {
      const thread = await database().agentThread.create({
        data: {
          brandId: brandA,
          kind: AgentThreadKind.THREAD,
          organizationId,
          userId: owner,
        },
      });
      const grant = await shares().grant(
        { organizationId, userId: owner },
        thread.id,
        {
          level,
          scope: AgentThreadShareScope.MEMBER,
          targetUserId: member,
        },
      );
      await engine().appendEvent({
        commandId: `ask:${thread.id}`,
        organizationId,
        payload: {
          allowFreeText: true,
          options: [],
          prompt: 'Which tone?',
          requestId: 'req-tone',
          title: 'Tone',
        },
        threadId: thread.id,
        type: 'input.requested',
        userId: owner,
      });
      return { grant, thread };
    }

    const answerAs = (userId: string, threadId: string) =>
      engine().resolveInputRequest({
        answer: 'Playful',
        organizationId,
        requestId: 'req-tone',
        threadId,
        userId,
      });

    beforeEach(async () => {
      vi.clearAllMocks();
      suffix = randomUUID();
      owner = id('owner');
      member = id('member');
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
      brandA = id('brand-a');
      await database().brand.create({
        data: {
          id: brandA,
          label: brandA,
          organizationId,
          slug: brandA,
          userId: owner,
        },
      });
      const ownerRole = await database().role.upsert({
        create: { key: MemberRole.CREATOR, label: MemberRole.CREATOR },
        update: {},
        where: { key: MemberRole.CREATOR },
      });
      await database().member.create({
        data: {
          brands: { connect: [{ id: brandA }] },
          currentBrandId: brandA,
          organizationId,
          roleId: ownerRole.id,
          roleKey: MemberRole.CREATOR,
          userId: owner,
        },
      });
      await createUserMember(member);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('lets a collaborator answer the question, recorded as them', async () => {
      const { thread } = await createThreadWithQuestion(
        AgentThreadShareLevel.COLLABORATE,
      );

      const resolved = await answerAs(member, thread.id);

      expect(resolved).toMatchObject({
        answer: 'Playful',
        requestId: 'req-tone',
        status: 'resolved',
      });
      const snapshot = await database().agentThreadSnapshot.findFirst({
        where: { organizationId, threadId: thread.id },
      });
      const data = snapshot?.data as
        | { inputRequests: Array<Record<string, unknown>> }
        | undefined;
      expect(data?.inputRequests[0]).toMatchObject({
        answer: 'Playful',
        resolvedByUserId: member,
        status: 'resolved',
      });
      const events = await database().agentThreadEvent.findMany({
        where: { organizationId, threadId: thread.id, type: 'input.resolved' },
      });
      expect(events).toHaveLength(1);
      expect(events[0].data).toMatchObject({ userId: member });
    });

    it("refuses another collaborator's retry of an answered question, and lets the owner repair it", async () => {
      const { thread } = await createThreadWithQuestion(
        AgentThreadShareLevel.COLLABORATE,
      );
      const other = id('other');
      await createUserMember(other);
      await shares().grant({ organizationId, userId: owner }, thread.id, {
        level: AgentThreadShareLevel.COLLABORATE,
        scope: AgentThreadShareScope.MEMBER,
        targetUserId: other,
      });
      await answerAs(member, thread.id);

      await expect(answerAs(other, thread.id)).rejects.toThrow(
        'This request was already answered.',
      );
      const repaired = await answerAs(owner, thread.id);

      expect(repaired.status).toBe('resolved');
      const events = await database().agentThreadEvent.findMany({
        where: { organizationId, threadId: thread.id, type: 'input.resolved' },
      });
      expect(events).toHaveLength(1);
      expect(events[0].data).toMatchObject({ userId: member });
    });

    it('still lets the owner answer their own question', async () => {
      const { thread } = await createThreadWithQuestion(
        AgentThreadShareLevel.VIEW,
      );

      const resolved = await answerAs(owner, thread.id);

      expect(resolved.status).toBe('resolved');
    });

    it('refuses a member whose share only lets them view', async () => {
      const { thread } = await createThreadWithQuestion(
        AgentThreadShareLevel.VIEW,
      );

      await expect(answerAs(member, thread.id)).rejects.toMatchObject({
        status: 404,
      });
      const snapshot = await database().agentThreadSnapshot.findFirst({
        where: { organizationId, threadId: thread.id },
      });
      const data = snapshot?.data as
        | { inputRequests: Array<{ status: string }> }
        | undefined;
      expect(data?.inputRequests[0]?.status).toBe('pending');
    });

    it('refuses a collaborator once the share is revoked', async () => {
      const { grant, thread } = await createThreadWithQuestion(
        AgentThreadShareLevel.COLLABORATE,
      );
      await shares().revoke(
        { organizationId, userId: owner },
        thread.id,
        grant.id,
      );

      await expect(answerAs(member, thread.id)).rejects.toMatchObject({
        status: 404,
      });
    });
  },
);
