import { randomUUID } from 'node:crypto';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { AgentThreadAccessService } from '@api/collections/agent-threads/services/agent-thread-access.service';
import { AgentThreadSharesService } from '@api/collections/agent-threads/services/agent-thread-shares.service';
import type { ServerPrisma } from '@api/server.dependencies';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentThreadKind,
  AgentThreadShareLevel,
  AgentThreadShareScope,
  MemberRole,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { ForbiddenException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentScopeContextService } from './agent-scope-context.service';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));

// Explicit opt-in only: an isolated, fully migrated database, never
// DATABASE_URL. Shares the database the thread-access spec uses; every test
// uses fresh ids and rows are not cleaned up.
const connectionString = process.env.AGENT_MASTER_THREAD_TEST_DATABASE_URL;

/**
 * #9937: a turn sent in a thread another member owns runs as the member who
 * sent it. The scope it carries, and the re-proof it makes at every
 * consequential step, are shown against a real database: a mocked client cannot
 * show that a revoked share or a removed brand assignment stops the very next
 * tool call.
 */
describe.skipIf(!connectionString)(
  'a turn in a shared agent thread PostgreSQL end-to-end (#9937)',
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
    const scopes = () =>
      new AgentScopeContextService(
        database() as unknown as Pick<
          ServerPrisma,
          'agentMessage' | 'agentThread' | 'brand'
        >,
        logger,
        brandAccess(),
        access(),
      );

    let suffix: string;
    let organizationId: string;
    let brandA: string;
    let owner: string;
    let member: string;
    let memberRowId: string;

    const id = (label: string) => `${label}-${suffix}`;

    async function createMember(userId: string, roleKey: MemberRole) {
      await database().user.create({ data: { handle: userId, id: userId } });
      const role = await database().role.upsert({
        create: { key: roleKey, label: roleKey },
        update: {},
        where: { key: roleKey },
      });
      const created = await database().member.create({
        data: {
          brands: { connect: [{ id: brandA }] },
          currentBrandId: brandA,
          organizationId,
          roleId: role.id,
          roleKey,
          userId,
        },
      });
      return created.id;
    }

    async function createSharedThread(level: AgentThreadShareLevel) {
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
      return { grant, thread };
    }

    const memberTurn = (threadId: string) => ({
      isSharedCollaborationAllowed: true,
      organizationId,
      threadId,
      userId: member,
    });

    beforeEach(async () => {
      vi.clearAllMocks();
      suffix = randomUUID();
      owner = id('owner');
      member = id('member');
      await database().user.create({ data: { handle: owner, id: owner } });
      organizationId = id('org');
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
      memberRowId = await createMember(member, MemberRole.CREATOR);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("runs the member's turn as the member, and the owner's turn as the owner", async () => {
      const { thread } = await createSharedThread(
        AgentThreadShareLevel.COLLABORATE,
      );

      const asMember = await scopes().prepareForTurn(memberTurn(thread.id));
      const asOwner = await scopes().prepareForTurn({
        organizationId,
        threadId: thread.id,
        userId: owner,
      });

      expect(asMember.existingScope).toMatchObject({
        brandId: brandA,
        threadOwnerUserId: owner,
        userId: member,
      });
      expect(asOwner.existingScope?.userId).toBe(owner);
      expect(asOwner.existingScope?.threadOwnerUserId).toBeUndefined();
    });

    it('lets the member through a consequential step only while the share stands', async () => {
      const { grant, thread } = await createSharedThread(
        AgentThreadShareLevel.COLLABORATE,
      );
      const prepared = await scopes().prepareForTurn(memberTurn(thread.id));
      const scope = prepared.existingScope;
      if (!scope) throw new Error('Expected a prepared scope');
      const explicit = { ...scope, isVersionExplicit: true };

      await expect(
        scopes().assertConsequentialBoundary(explicit, 'tool'),
      ).resolves.toBeUndefined();

      await shares().revoke(
        { organizationId, userId: owner },
        thread.id,
        grant.id,
      );

      await expect(
        scopes().assertConsequentialBoundary(explicit, 'tool'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('stops the next step when the member loses the thread brand', async () => {
      const { thread } = await createSharedThread(
        AgentThreadShareLevel.COLLABORATE,
      );
      const prepared = await scopes().prepareForTurn(memberTurn(thread.id));
      const scope = prepared.existingScope;
      if (!scope) throw new Error('Expected a prepared scope');

      await database().member.update({
        data: { brands: { disconnect: [{ id: brandA }] } },
        where: { id: memberRowId },
      });

      await expect(
        scopes().assertConsequentialBoundary(
          { ...scope, isVersionExplicit: true },
          'tool',
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('refuses a view-only member a turn', async () => {
      const { thread } = await createSharedThread(AgentThreadShareLevel.VIEW);

      await expect(
        scopes().prepareForTurn(memberTurn(thread.id)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('never opens another member thread to a caller that did not opt in', async () => {
      const { thread } = await createSharedThread(
        AgentThreadShareLevel.COLLABORATE,
      );

      await expect(
        scopes().prepareForTurn({
          organizationId,
          threadId: thread.id,
          userId: member,
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('never lets a member from another organization in', async () => {
      const { thread } = await createSharedThread(
        AgentThreadShareLevel.COLLABORATE,
      );

      await expect(
        scopes().prepareForTurn({
          ...memberTurn(thread.id),
          organizationId: id('some-other-org'),
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
  },
);
