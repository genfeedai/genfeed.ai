import { randomUUID } from 'node:crypto';
import { AgentArtifactReferenceService } from '@api/agent-artifacts/agent-artifact-reference.service';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadTurnsController } from '@api/collections/agent-threads/controllers/agent-thread-turns.controller';
import { AgentThreadAccessService } from '@api/collections/agent-threads/services/agent-thread-access.service';
import { AgentThreadMentionsService } from '@api/collections/agent-threads/services/agent-thread-mentions.service';
import { AgentThreadSharesService } from '@api/collections/agent-threads/services/agent-thread-shares.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { MENTION_CREATED_EVENT } from '@api/collections/mentions/constants/mention-events.constants';
import type { MentionCreatedEvent } from '@api/collections/mentions/interfaces/mention.interface';
import {
  MENTION_NEEDS_SHARE,
  MENTION_NOT_ALLOWED,
  TeammateMentionsService,
} from '@api/collections/mentions/services/teammate-mentions.service';
import { TaskCommentsService } from '@api/collections/task-comments/services/task-comments.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentThreadKind,
  AgentThreadShareLevel,
  AgentThreadShareScope,
  MemberRole,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { HttpException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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

interface MessageResponse {
  data: { attributes: { mentionedUserIds: string[]; mentions: unknown[] } };
}

/**
 * #9946: mentioning a teammate in an agent thread or a task comment. A mention
 * of a member without brand access is refused and nothing is saved; one with
 * access is stored by user id and read back with the member's name.
 */
describe.skipIf(!connectionString)(
  'teammate mentions PostgreSQL end-to-end (#9946)',
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
    const asPrisma = () => database() as unknown as PrismaService;
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const emitter = new EventEmitter2();
    const events: MentionCreatedEvent[] = [];
    emitter.on(MENTION_CREATED_EVENT, (event: MentionCreatedEvent) =>
      events.push(event),
    );

    const brandAccess = () => new BrandAccessService(asPrisma());
    const mentions = () =>
      new TeammateMentionsService(asPrisma(), brandAccess(), emitter);
    const threadAccess = () =>
      new AgentThreadAccessService(asPrisma(), brandAccess());
    const turns = () =>
      new AgentThreadTurnsController(
        new AgentThreadsService(asPrisma(), logger as never, {} as never),
        threadAccess(),
        new AgentThreadMentionsService(
          mentions(),
          threadAccess(),
          new AgentThreadSharesService(
            asPrisma(),
            threadAccess(),
            brandAccess(),
          ),
        ),
        mentions(),
        new AgentMessagesService(
          asPrisma(),
          logger as never,
          new AgentArtifactReferenceService(
            asPrisma() as never,
            logger as never,
          ),
        ),
        {} as never,
        logger as never,
      );
    const comments = () =>
      new TaskCommentsService(asPrisma(), logger as never, mentions());

    let suffix: string;
    let organizationId: string;
    let brandA: string;
    let brandB: string;
    let author: string;
    let teammate: string;
    let brandBOnly: string;
    let formerMember: string;
    let otherOrgUser: string;

    const id = (label: string) => `${label}-${suffix}`;
    const actor = (userId: string) => ({ organizationId, userId });
    const asUser = (userId: string) =>
      ({ id: userId, organizationId, userId }) as never;

    async function createUser(userId: string, firstName: string) {
      await database().user.create({
        data: { firstName, handle: userId, id: userId, lastName: 'Tester' },
      });
      return userId;
    }

    async function createMember(
      userId: string,
      brandIds: string[],
      data: { isActive?: boolean; organizationId?: string } = {},
    ) {
      const role = await database().role.upsert({
        create: { key: MemberRole.CREATOR, label: MemberRole.CREATOR },
        update: {},
        where: { key: MemberRole.CREATOR },
      });
      return database().member.create({
        data: {
          brands: { connect: brandIds.map((brandId) => ({ id: brandId })) },
          currentBrandId: brandIds[0] ?? brandA,
          isActive: data.isActive ?? true,
          organizationId: data.organizationId ?? organizationId,
          roleId: role.id,
          roleKey: MemberRole.CREATOR,
          userId,
        },
      });
    }

    function createThread(kind: AgentThreadKind = AgentThreadKind.THREAD) {
      return database().agentThread.create({
        data: {
          brandId: kind === AgentThreadKind.THREAD ? brandA : null,
          kind,
          organizationId,
          title: 'Spring launch',
          userId: author,
        },
      });
    }

    async function createTask() {
      return database().task.create({
        data: { brandId: brandA, organizationId, title: 'Fix captions' },
      });
    }

    async function share(threadId: string, targetUserId: string) {
      await database().agentThreadShare.create({
        data: {
          grantedByUserId: author,
          level: AgentThreadShareLevel.VIEW,
          organizationId,
          scope: AgentThreadShareScope.MEMBER,
          targetUserId,
          threadId,
        },
      });
    }

    async function rejection(promise: Promise<unknown>) {
      const error = await promise.then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(HttpException);
      const body = (error as HttpException).getResponse() as {
        meta?: { reason?: string; userIds?: string[] };
      };
      return { body, status: (error as HttpException).getStatus() };
    }

    const savedMessages = (threadId: string) =>
      database().agentMessage.count({ where: { organizationId, threadId } });

    beforeEach(async () => {
      vi.clearAllMocks();
      events.length = 0;
      suffix = randomUUID();
      author = await createUser(id('author'), 'Ada');
      teammate = await createUser(id('teammate'), 'Grace');
      brandBOnly = await createUser(id('brand-b-only'), 'Linus');
      formerMember = await createUser(id('former'), 'Ken');
      otherOrgUser = await createUser(id('other-org'), 'Dennis');
      organizationId = id('org');
      await database().organization.create({
        data: {
          id: organizationId,
          label: organizationId,
          prefix: 'MN',
          slug: organizationId,
          userId: author,
        },
      });
      [brandA, brandB] = (await Promise.all(
        ['a', 'b'].map(async (key) => {
          const brandId = id(`brand-${key}`);
          await database().brand.create({
            data: {
              id: brandId,
              label: brandId,
              organizationId,
              slug: brandId,
              userId: author,
            },
          });
          return brandId;
        }),
      )) as [string, string];
      await createMember(author, [brandA]);
      await createMember(teammate, [brandA]);
      await createMember(brandBOnly, [brandB]);
      await createMember(formerMember, [brandA], { isActive: false });
      const otherOrgId = id('other-org-id');
      await database().organization.create({
        data: {
          id: otherOrgId,
          label: otherOrgId,
          prefix: 'OT',
          slug: otherOrgId,
          userId: otherOrgUser,
        },
      });
      const otherBrand = await database().brand.create({
        data: {
          id: id('other-brand'),
          label: 'other',
          organizationId: otherOrgId,
          slug: id('other-brand'),
          userId: otherOrgUser,
        },
      });
      await createMember(otherOrgUser, [otherBrand.id], {
        organizationId: otherOrgId,
      });
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    describe('in an agent thread', () => {
      it('refuses a mention of a member without brand access and saves nothing', async () => {
        const thread = await createThread();

        const { body, status } = await rejection(
          turns().addMessage(
            {} as never,
            thread.id,
            { content: 'Look @Linus', mentionedUserIds: [brandBOnly] },
            asUser(author),
          ),
        );

        expect(status).toBe(400);
        expect(body.meta).toEqual({
          reason: MENTION_NOT_ALLOWED,
          userIds: [brandBOnly],
        });
        expect(await savedMessages(thread.id)).toBe(0);
        expect(events).toEqual([]);
      });

      it.each([
        ['an inactive member', () => formerMember],
        ['a user from another organization', () => otherOrgUser],
        ['an unknown id', () => 'not-a-user'],
      ])('refuses a mention of %s', async (_label, pick) => {
        const thread = await createThread();

        const { body } = await rejection(
          turns().addMessage(
            {} as never,
            thread.id,
            { content: 'Hi', mentionedUserIds: [pick()] },
            asUser(author),
          ),
        );

        expect(body.meta?.reason).toBe(MENTION_NOT_ALLOWED);
        expect(await savedMessages(thread.id)).toBe(0);
      });

      it('stores a mention of a member who can open the thread by id and returns the name', async () => {
        const thread = await createThread();
        await share(thread.id, teammate);

        const response = (await turns().addMessage(
          {} as never,
          thread.id,
          { content: 'Look @Grace', mentionedUserIds: [teammate, teammate] },
          asUser(author),
        )) as MessageResponse;

        expect(response.data.attributes.mentionedUserIds).toEqual([teammate]);
        expect(response.data.attributes.mentions).toEqual([
          { id: teammate, name: 'Grace Tester' },
        ]);
        const [row] = await database().agentMessage.findMany({
          where: { organizationId, threadId: thread.id },
        });
        expect(row?.mentionedUserIds).toEqual([teammate]);
        expect(events).toEqual([
          {
            actorUserId: author,
            brandId: brandA,
            label: 'Spring launch',
            mentionedUserId: teammate,
            organizationId,
            source: { id: row?.id, type: 'agent_thread' },
            threadId: thread.id,
          },
        ]);
      });

      it('asks for a share when the member reaches the brand but cannot open the thread', async () => {
        const thread = await createThread();

        const { body, status } = await rejection(
          turns().addMessage(
            {} as never,
            thread.id,
            { content: 'Look @Grace', mentionedUserIds: [teammate] },
            asUser(author),
          ),
        );

        expect(status).toBe(409);
        expect(body.meta).toEqual({
          canShare: true,
          reason: MENTION_NEEDS_SHARE,
          userIds: [teammate],
        });
        expect(await savedMessages(thread.id)).toBe(0);
        expect(events).toEqual([]);
        expect(
          await database().agentThreadShare.count({
            where: { organizationId, threadId: thread.id },
          }),
        ).toBe(0);
      });

      it('shares the thread at view in the same step when asked to', async () => {
        const thread = await createThread();

        await turns().addMessage(
          {} as never,
          thread.id,
          {
            content: 'Look @Grace',
            mentionedUserIds: [teammate],
            shareMentioned: true,
          },
          asUser(author),
        );

        const shares = await database().agentThreadShare.findMany({
          where: { organizationId, threadId: thread.id },
        });
        expect(shares).toMatchObject([
          {
            level: AgentThreadShareLevel.VIEW,
            scope: AgentThreadShareScope.MEMBER,
            targetUserId: teammate,
          },
        ]);
        await expect(
          threadAccess().hasAccess(actor(teammate), thread.id, 'view'),
        ).resolves.toBe(true);
        expect(events.map((event) => event.mentionedUserId)).toEqual([
          teammate,
        ]);
      });

      it('does not alert the author who mentions themselves', async () => {
        const thread = await createThread();

        await turns().addMessage(
          {} as never,
          thread.id,
          { content: 'Note to self', mentionedUserIds: [author] },
          asUser(author),
        );

        expect(await savedMessages(thread.id)).toBe(1);
        expect(events).toEqual([]);
      });

      it('refuses mentions in a master thread', async () => {
        const thread = await createThread(AgentThreadKind.MASTER);

        await expect(
          turns().addMessage(
            {} as never,
            thread.id,
            { content: 'Hi', mentionedUserIds: [teammate] },
            asUser(author),
          ),
        ).rejects.toThrow('personal assistant thread');
        expect(await savedMessages(thread.id)).toBe(0);
      });
    });

    describe('in a task comment', () => {
      it('refuses a mention of a member without brand access and saves nothing', async () => {
        const task = await createTask();

        const { body, status } = await rejection(
          comments().createForTask(actor(author), task.id, {
            body: 'Please check',
            mentionedUserIds: [brandBOnly],
          }),
        );

        expect(status).toBe(400);
        expect(body.meta?.reason).toBe(MENTION_NOT_ALLOWED);
        expect(
          await database().taskComment.count({
            where: { organizationId, taskId: task.id },
          }),
        ).toBe(0);
        expect(events).toEqual([]);
      });

      it('stores a mention of a member with brand access by id and returns the name', async () => {
        const task = await createTask();

        const comment = await comments().createForTask(actor(author), task.id, {
          body: 'Please check',
          mentionedUserIds: [teammate],
        });

        expect(comment).toMatchObject({
          authorUserId: author,
          mentionedUserIds: [teammate],
          mentions: [{ id: teammate, name: 'Grace Tester' }],
        });
        const [listed] = await comments().findByTaskWithMentions(
          task.id,
          organizationId,
        );
        expect(listed?.mentions).toEqual([
          { id: teammate, name: 'Grace Tester' },
        ]);
        expect(events).toMatchObject([
          {
            brandId: brandA,
            label: 'Fix captions',
            mentionedUserId: teammate,
            source: { id: comment.id, type: 'task_comment' },
            taskId: task.id,
          },
        ]);
      });

      it('does not find a task of another organization', async () => {
        const task = await createTask();

        await expect(
          comments().createForTask(
            { organizationId: id('other-org-id'), userId: otherOrgUser },
            task.id,
            { body: 'Hello' },
          ),
        ).rejects.toThrow('Task');
        expect(
          await database().taskComment.count({ where: { taskId: task.id } }),
        ).toBe(0);
      });
    });
  },
);
