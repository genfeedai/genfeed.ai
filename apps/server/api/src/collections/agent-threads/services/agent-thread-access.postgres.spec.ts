import { randomUUID } from 'node:crypto';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { AgentThreadAccessService } from '@api/collections/agent-threads/services/agent-thread-access.service';
import { AgentThreadSharesService } from '@api/collections/agent-threads/services/agent-thread-shares.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { deleteAgentThreadSharesForRelocation } from '@api/collections/agent-threads/utils/agent-thread-relocation.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentThreadAccessLevel,
  AgentThreadKind,
  AgentThreadOwnerFilter,
  AgentThreadShareLevel,
  AgentThreadShareScope,
  MemberRole,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));

// Explicit opt-in only: an isolated, fully migrated database, never
// DATABASE_URL. Shares the database the master-thread spec uses; every test
// uses fresh ids and rows are not cleaned up.
const connectionString = process.env.AGENT_MASTER_THREAD_TEST_DATABASE_URL;

const PAGE = { limit: 50, page: 1, skip: 0 };

/**
 * #9936: thread sharing and the one access check. The guarantees (the live
 * role and brand access, the opaque denial, the master-thread refusal, the
 * constraints on `agent_thread_shares`) are proved against a real database: a
 * mocked Prisma client cannot show that a removed brand assignment or a revoked
 * share stops working on the very next request.
 */
describe.skipIf(!connectionString)(
  'agent thread sharing and access PostgreSQL end-to-end (#9936)',
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
      );
    const threads = () =>
      new AgentThreadsService(
        database() as unknown as PrismaService,
        logger as never,
        {} as never,
      );

    let suffix: string;
    let organizationId: string;
    let brandA: string;
    let brandB: string;
    let owner: string;
    let teammate: string;
    let brandBOnly: string;
    let admin: string;

    const id = (label: string) => `${label}-${suffix}`;
    const actor = (userId: string, orgId = organizationId) => ({
      organizationId: orgId,
      userId,
    });

    async function createUser(userId: string) {
      await database().user.create({ data: { handle: userId, id: userId } });
      return userId;
    }

    async function createMember(
      orgId: string,
      userId: string,
      roleKey: MemberRole,
      brandIds: string[],
      currentBrandId: string,
    ) {
      const role = await database().role.upsert({
        create: { key: roleKey, label: roleKey },
        update: {},
        where: { key: roleKey },
      });
      return database().member.create({
        data: {
          brands: { connect: brandIds.map((brandId) => ({ id: brandId })) },
          currentBrandId,
          organizationId: orgId,
          roleId: role.id,
          roleKey,
          userId,
        },
      });
    }

    async function createOrganization(label: string, ownerId: string) {
      const orgId = id(label);
      await database().organization.create({
        data: { id: orgId, label: orgId, slug: orgId, userId: ownerId },
      });
      const brandIds = await Promise.all(
        ['a', 'b'].map(async (key) => {
          const brandId = id(`${label}-brand-${key}`);
          await database().brand.create({
            data: {
              id: brandId,
              label: brandId,
              organizationId: orgId,
              slug: brandId,
              userId: ownerId,
            },
          });
          return brandId;
        }),
      );
      return { brandIds, orgId };
    }

    async function createThread(
      userId: string,
      data: { brandId?: string | null; kind?: AgentThreadKind } = {},
    ) {
      return database().agentThread.create({
        data: {
          brandId: data.brandId ?? null,
          kind: data.kind ?? AgentThreadKind.THREAD,
          organizationId,
          userId,
        },
      });
    }

    async function share(
      threadId: string,
      scope: AgentThreadShareScope,
      level: AgentThreadShareLevel,
      target: { targetBrandId?: string; targetUserId?: string } = {},
    ) {
      return shares().grant(actor(owner), threadId, {
        level,
        scope,
        ...target,
      });
    }

    beforeEach(async () => {
      vi.clearAllMocks();
      suffix = randomUUID();
      owner = await createUser(id('owner'));
      teammate = await createUser(id('teammate'));
      brandBOnly = await createUser(id('brand-b-only'));
      admin = await createUser(id('admin'));
      const created = await createOrganization('org', owner);
      organizationId = created.orgId;
      [brandA, brandB] = created.brandIds as [string, string];
      await createMember(
        organizationId,
        owner,
        MemberRole.CREATOR,
        [brandA],
        brandA,
      );
      await createMember(
        organizationId,
        teammate,
        MemberRole.CREATOR,
        [brandA],
        brandA,
      );
      await createMember(
        organizationId,
        brandBOnly,
        MemberRole.CREATOR,
        [brandB],
        brandB,
      );
      await createMember(organizationId, admin, MemberRole.ADMIN, [], brandA);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    describe('owner', () => {
      it('opens, prompts in and manages their own thread without any share', async () => {
        const thread = await createThread(owner, { brandId: brandA });

        const resolved = await access().assertAccess(
          actor(owner),
          thread.id,
          'manage',
        );

        expect(resolved).toMatchObject({
          accessLevel: AgentThreadAccessLevel.OWNER,
          canManageShares: true,
        });
        await expect(
          access().assertAccess(actor(owner), thread.id, 'collaborate'),
        ).resolves.toMatchObject({ accessLevel: AgentThreadAccessLevel.OWNER });
      });
    });

    describe('shared member', () => {
      it('cannot open a thread that is not shared with them', async () => {
        const thread = await createThread(owner, { brandId: brandA });

        await expect(
          access().assertAccess(actor(teammate), thread.id, 'view'),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('views a thread shared with them at view level, but cannot prompt or manage', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        await share(
          thread.id,
          AgentThreadShareScope.MEMBER,
          AgentThreadShareLevel.VIEW,
          {
            targetUserId: teammate,
          },
        );

        await expect(
          access().assertAccess(actor(teammate), thread.id, 'view'),
        ).resolves.toMatchObject({
          accessLevel: AgentThreadAccessLevel.VIEW,
          canManageShares: false,
        });
        await expect(
          access().assertAccess(actor(teammate), thread.id, 'collaborate'),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
          shares().list(actor(teammate), thread.id),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
          shares().grant(actor(teammate), thread.id, {
            level: AgentThreadShareLevel.VIEW,
            scope: AgentThreadShareScope.ORGANIZATION,
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('prompts in a thread shared with them at collaborate level', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        await share(
          thread.id,
          AgentThreadShareScope.MEMBER,
          AgentThreadShareLevel.COLLABORATE,
          {
            targetUserId: teammate,
          },
        );

        await expect(
          access().assertAccess(actor(teammate), thread.id, 'collaborate'),
        ).resolves.toMatchObject({
          accessLevel: AgentThreadAccessLevel.COLLABORATE,
        });
      });

      it('takes the strongest of several shares that reach them', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        await share(
          thread.id,
          AgentThreadShareScope.ORGANIZATION,
          AgentThreadShareLevel.VIEW,
        );
        await share(
          thread.id,
          AgentThreadShareScope.MEMBER,
          AgentThreadShareLevel.COLLABORATE,
          {
            targetUserId: teammate,
          },
        );

        await expect(
          access().assertAccess(actor(teammate), thread.id, 'collaborate'),
        ).resolves.toMatchObject({
          accessLevel: AgentThreadAccessLevel.COLLABORATE,
        });
      });

      it('changes the level of the live share instead of adding a second one', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        const first = await share(
          thread.id,
          AgentThreadShareScope.MEMBER,
          AgentThreadShareLevel.VIEW,
          { targetUserId: teammate },
        );
        const second = await share(
          thread.id,
          AgentThreadShareScope.MEMBER,
          AgentThreadShareLevel.COLLABORATE,
          { targetUserId: teammate },
        );

        expect(second.id).toBe(first.id);
        const rows = await database().agentThreadShare.findMany({
          where: { isDeleted: false, organizationId, threadId: thread.id },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.level).toBe(AgentThreadShareLevel.COLLABORATE);
      });
    });

    describe('member without brand access', () => {
      it('gets the same denial as for an unknown thread, even with an organization share', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        await share(
          thread.id,
          AgentThreadShareScope.ORGANIZATION,
          AgentThreadShareLevel.COLLABORATE,
        );
        await share(
          thread.id,
          AgentThreadShareScope.MEMBER,
          AgentThreadShareLevel.COLLABORATE,
          {
            targetUserId: brandBOnly,
          },
        );

        const denied = await access()
          .assertAccess(actor(brandBOnly), thread.id, 'view')
          .catch((error: unknown) => error);
        const unknown = await access()
          .assertAccess(actor(brandBOnly), `missing-${suffix}`, 'view')
          .catch((error: unknown) => error);

        expect(denied).toBeInstanceOf(NotFoundException);
        expect((denied as NotFoundException).getStatus()).toBe(
          (unknown as NotFoundException).getStatus(),
        );
        // The detail names only the id the caller sent, so it says nothing.
        expect(
          ((denied as NotFoundException).getResponse() as { detail: string })
            .detail,
        ).toBe(`Thread with identifier '${thread.id}' not found`);
      });

      it('does not see the thread in the shared list', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        await share(
          thread.id,
          AgentThreadShareScope.ORGANIZATION,
          AgentThreadShareLevel.VIEW,
        );

        const list = await listFor(brandBOnly, AgentThreadOwnerFilter.SHARED);

        expect(list).toEqual([]);
      });

      it('loses access the moment their brand assignment is removed', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        await share(
          thread.id,
          AgentThreadShareScope.ORGANIZATION,
          AgentThreadShareLevel.VIEW,
        );
        await expect(
          access().assertAccess(actor(teammate), thread.id, 'view'),
        ).resolves.toBeDefined();

        const member = await database().member.findFirstOrThrow({
          where: { organizationId, userId: teammate },
        });
        await database().member.update({
          data: { brands: { disconnect: [{ id: brandA }] } },
          where: { id: member.id },
        });

        await expect(
          access().assertAccess(actor(teammate), thread.id, 'view'),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('loses access the moment their membership is deactivated', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        await share(
          thread.id,
          AgentThreadShareScope.MEMBER,
          AgentThreadShareLevel.VIEW,
          {
            targetUserId: teammate,
          },
        );

        await database().member.updateMany({
          data: { isActive: false },
          where: { organizationId, userId: teammate },
        });

        await expect(
          access().assertAccess(actor(teammate), thread.id, 'view'),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          listFor(teammate, AgentThreadOwnerFilter.SHARED),
        ).resolves.toEqual([]);
      });
    });

    describe('brand share', () => {
      it('reaches members with access to the brand and nobody else', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        await share(
          thread.id,
          AgentThreadShareScope.BRAND,
          AgentThreadShareLevel.VIEW,
        );

        await expect(
          access().assertAccess(actor(teammate), thread.id, 'view'),
        ).resolves.toMatchObject({ accessLevel: AgentThreadAccessLevel.VIEW });
        await expect(
          access().assertAccess(actor(brandBOnly), thread.id, 'view'),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('refuses a brand other than the thread brand', async () => {
        const thread = await createThread(owner, { brandId: brandA });

        await expect(
          share(
            thread.id,
            AgentThreadShareScope.BRAND,
            AgentThreadShareLevel.VIEW,
            {
              targetBrandId: brandB,
            },
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    describe('removed share', () => {
      it('stops working on the next request', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        const created = await share(
          thread.id,
          AgentThreadShareScope.MEMBER,
          AgentThreadShareLevel.COLLABORATE,
          { targetUserId: teammate },
        );
        await expect(
          access().assertAccess(actor(teammate), thread.id, 'collaborate'),
        ).resolves.toBeDefined();

        await shares().revoke(actor(owner), thread.id, created.id);

        await expect(
          access().assertAccess(actor(teammate), thread.id, 'view'),
        ).rejects.toBeInstanceOf(NotFoundException);
        const row = await database().agentThreadShare.findUniqueOrThrow({
          where: { id: created.id },
        });
        expect(row.isDeleted).toBe(true);
      });

      it('can be granted again after it was removed', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        const first = await share(
          thread.id,
          AgentThreadShareScope.MEMBER,
          AgentThreadShareLevel.VIEW,
          { targetUserId: teammate },
        );
        await shares().revoke(actor(owner), thread.id, first.id);

        const again = await share(
          thread.id,
          AgentThreadShareScope.MEMBER,
          AgentThreadShareLevel.VIEW,
          { targetUserId: teammate },
        );

        expect(again.id).not.toBe(first.id);
        await expect(
          access().assertAccess(actor(teammate), thread.id, 'view'),
        ).resolves.toBeDefined();
      });

      it('cannot be removed through another thread', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        const other = await createThread(owner, { brandId: brandA });
        const created = await share(
          thread.id,
          AgentThreadShareScope.MEMBER,
          AgentThreadShareLevel.VIEW,
          { targetUserId: teammate },
        );

        await expect(
          shares().revoke(actor(owner), other.id, created.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          access().assertAccess(actor(teammate), thread.id, 'view'),
        ).resolves.toBeDefined();
      });
    });

    describe('foreign organization', () => {
      it('cannot reach a thread of another organization, shared or not', async () => {
        const stranger = await createUser(id('stranger'));
        const foreign = await createOrganization('foreign', stranger);
        await createMember(
          foreign.orgId,
          stranger,
          MemberRole.OWNER,
          foreign.brandIds,
          foreign.brandIds[0] as string,
        );
        const thread = await createThread(owner, { brandId: brandA });
        await share(
          thread.id,
          AgentThreadShareScope.ORGANIZATION,
          AgentThreadShareLevel.COLLABORATE,
        );

        await expect(
          access().assertAccess(
            actor(stranger, foreign.orgId),
            thread.id,
            'view',
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          access().assertAccess(
            actor(stranger, foreign.orgId),
            thread.id,
            'manage',
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          listFor(stranger, AgentThreadOwnerFilter.ALL, foreign.orgId),
        ).resolves.toEqual([]);
        await expect(
          shares().list(actor(stranger, foreign.orgId), thread.id),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('cannot be shared with a member of another organization', async () => {
        const stranger = await createUser(id('stranger'));
        const foreign = await createOrganization('foreign', stranger);
        await createMember(
          foreign.orgId,
          stranger,
          MemberRole.OWNER,
          foreign.brandIds,
          foreign.brandIds[0] as string,
        );
        const thread = await createThread(owner, { brandId: brandA });

        await expect(
          share(
            thread.id,
            AgentThreadShareScope.MEMBER,
            AgentThreadShareLevel.VIEW,
            {
              targetUserId: stranger,
            },
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    describe('master thread', () => {
      it('refuses sharing and stays invisible to everyone else', async () => {
        const master = await createThread(owner, {
          kind: AgentThreadKind.MASTER,
        });

        await expect(
          share(
            master.id,
            AgentThreadShareScope.ORGANIZATION,
            AgentThreadShareLevel.VIEW,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
          access().assertAccess(actor(teammate), master.id, 'view'),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          listFor(teammate, AgentThreadOwnerFilter.ALL),
        ).resolves.toEqual([]);
      });

      it('refuses a share row written around the service', async () => {
        const master = await createThread(owner, {
          kind: AgentThreadKind.MASTER,
        });

        await expect(
          database().agentThreadShare.create({
            data: {
              grantedByUserId: owner,
              level: AgentThreadShareLevel.VIEW,
              organizationId,
              scope: AgentThreadShareScope.ORGANIZATION,
              threadId: master.id,
            },
          }),
        ).rejects.toThrow(/master agent thread cannot be shared/);
      });
    });

    describe('organization admin', () => {
      it('creates and removes shares on a thread they do not own, without gaining access to it', async () => {
        const thread = await createThread(owner, { brandId: brandA });

        const created = await shares().grant(actor(admin), thread.id, {
          level: AgentThreadShareLevel.VIEW,
          scope: AgentThreadShareScope.MEMBER,
          targetUserId: teammate,
        });
        await expect(
          shares().list(actor(admin), thread.id),
        ).resolves.toHaveLength(1);
        await expect(
          access().assertAccess(actor(teammate), thread.id, 'view'),
        ).resolves.toBeDefined();

        await shares().revoke(actor(admin), thread.id, created.id);
        await expect(
          access().assertAccess(actor(teammate), thread.id, 'view'),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('is an ordinary member when an API key carries no admin scope', async () => {
        const thread = await createThread(owner, { brandId: brandA });

        await expect(
          access().assertAccess(
            { ...actor(admin), apiKeyId: 'key', isApiKey: true, scopes: [] },
            thread.id,
            'manage',
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('does not let an ordinary member who is not the owner manage a thread', async () => {
        const thread = await createThread(owner, { brandId: brandA });

        await expect(
          shares().grant(actor(teammate), thread.id, {
            level: AgentThreadShareLevel.VIEW,
            scope: AgentThreadShareScope.ORGANIZATION,
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    describe('thread list', () => {
      it('filters to own, shared or both, and reports how each thread is reached', async () => {
        const own = await createThread(teammate, { brandId: brandA });
        const shared = await createThread(owner, { brandId: brandA });
        const hidden = await createThread(owner, { brandId: brandA });
        await share(
          shared.id,
          AgentThreadShareScope.ORGANIZATION,
          AgentThreadShareLevel.COLLABORATE,
        );

        const all = await listFor(teammate, AgentThreadOwnerFilter.ALL);
        const mine = await listFor(teammate, AgentThreadOwnerFilter.MINE);
        const sharedOnly = await listFor(
          teammate,
          AgentThreadOwnerFilter.SHARED,
        );

        expect(all.map((row) => row.id).sort()).toEqual(
          [own.id, shared.id].sort(),
        );
        expect(mine.map((row) => row.id)).toEqual([own.id]);
        expect(sharedOnly.map((row) => row.id)).toEqual([shared.id]);
        expect(all.map((row) => row.id)).not.toContain(hidden.id);
        expect(
          Object.fromEntries(all.map((row) => [row.id, row.accessLevel])),
        ).toEqual({
          [own.id]: AgentThreadAccessLevel.OWNER,
          [shared.id]: AgentThreadAccessLevel.COLLABORATE,
        });
      });

      it('does not list a removed share', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        const created = await share(
          thread.id,
          AgentThreadShareScope.MEMBER,
          AgentThreadShareLevel.VIEW,
          { targetUserId: teammate },
        );
        await expect(
          listFor(teammate, AgentThreadOwnerFilter.SHARED),
        ).resolves.toHaveLength(1);

        await shares().revoke(actor(owner), thread.id, created.id);

        await expect(
          listFor(teammate, AgentThreadOwnerFilter.SHARED),
        ).resolves.toEqual([]);
      });
    });

    describe('brand relocation', () => {
      it('ends the shares of a moving brand and keeps every other share', async () => {
        const moving = await createThread(owner, { brandId: brandA });
        const staying = await createThread(owner, { brandId: brandB });
        const movingShare = await share(
          moving.id,
          AgentThreadShareScope.ORGANIZATION,
          AgentThreadShareLevel.VIEW,
        );
        const stayingShare = await share(
          staying.id,
          AgentThreadShareScope.ORGANIZATION,
          AgentThreadShareLevel.VIEW,
        );

        await database().$transaction((tx) =>
          deleteAgentThreadSharesForRelocation(tx, brandA),
        );

        const remaining = await database().agentThreadShare.findMany({
          where: { id: { in: [movingShare.id, stayingShare.id] } },
        });
        expect(remaining.map((row) => row.id)).toEqual([stayingShare.id]);
      });
    });

    describe('share table constraints', () => {
      it('rejects a scope that does not match its target', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        const base = {
          grantedByUserId: owner,
          level: AgentThreadShareLevel.VIEW,
          organizationId,
          threadId: thread.id,
        };

        await expect(
          database().agentThreadShare.create({
            data: { ...base, scope: AgentThreadShareScope.MEMBER },
          }),
        ).rejects.toThrow();
        await expect(
          database().agentThreadShare.create({
            data: {
              ...base,
              scope: AgentThreadShareScope.ORGANIZATION,
              targetUserId: teammate,
            },
          }),
        ).rejects.toThrow();
        await expect(
          database().agentThreadShare.create({
            data: { ...base, scope: 'everyone' },
          }),
        ).rejects.toThrow();
        await expect(
          database().agentThreadShare.create({
            data: {
              ...base,
              level: 'edit',
              scope: AgentThreadShareScope.ORGANIZATION,
            },
          }),
        ).rejects.toThrow();
      });

      it('keeps one live share per target at the database', async () => {
        const thread = await createThread(owner, { brandId: brandA });
        const data = {
          grantedByUserId: owner,
          level: AgentThreadShareLevel.VIEW,
          organizationId,
          scope: AgentThreadShareScope.ORGANIZATION,
          threadId: thread.id,
        };
        await database().agentThreadShare.create({ data });

        await expect(
          database().agentThreadShare.create({ data }),
        ).rejects.toMatchObject({
          code: 'P2002',
        });
      });
    });

    async function listFor(
      userId: string,
      owner: AgentThreadOwnerFilter,
      orgId = organizationId,
    ) {
      const scope = await access().resolveListScope(actor(userId, orgId));
      const page = await threads().getUserThreads(
        userId,
        orgId,
        undefined,
        undefined,
        undefined,
        PAGE,
        { ownerWhere: access().buildOwnerWhere(userId, scope, owner) },
      );
      const levels = await access().resolveAccessLevels(scope, page.docs);
      return page.docs.map((doc) => ({
        accessLevel: levels.get(doc.id),
        id: doc.id,
      }));
    }
  },
);
