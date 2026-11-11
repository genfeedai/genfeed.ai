import { randomUUID } from 'node:crypto';
import { AgentArtifactReferenceService } from '@api/agent-artifacts/agent-artifact-reference.service';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadAccessService } from '@api/collections/agent-threads/services/agent-thread-access.service';
import { AgentThreadSharesService } from '@api/collections/agent-threads/services/agent-thread-shares.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { IngredientReviewStateService } from '@api/collections/ingredients/services/ingredient-review-state.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import { TaskReviewAccessService } from '@api/collections/tasks/services/task-review-access.service';
import { TaskReviewRequestsService } from '@api/collections/tasks/services/task-review-requests.service';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentThreadAccessLevel,
  AgentThreadKind,
  LibraryReviewState,
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
// DATABASE_URL. Shares the database the thread-sharing spec uses; every test
// uses fresh ids and rows are not cleaned up.
const connectionString = process.env.AGENT_MASTER_THREAD_TEST_DATABASE_URL;

/**
 * #9945: asking a teammate to review a Library asset. The guarantees (one task
 * and one shared thread per reviewer, only members who reach the asset's brand
 * can be chosen, only the reviewer or an admin decides) are proved against a
 * real database, where brand assignments and roles are real rows.
 */
describe.skipIf(!connectionString)(
  'task review requests PostgreSQL end-to-end (#9945)',
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

    const brandAccess = () => new BrandAccessService(asPrisma());
    const threadAccess = () =>
      new AgentThreadAccessService(asPrisma(), brandAccess());
    const reviewAccess = () =>
      new TaskReviewAccessService(asPrisma(), brandAccess());
    const service = () =>
      new TaskReviewRequestsService(
        asPrisma(),
        brandAccess(),
        reviewAccess(),
        new TasksService(
          asPrisma(),
          logger as never,
          {} as never,
          {} as never,
          {} as never,
        ),
        new TaskCountersService(asPrisma(), logger as never),
        {
          findOneSelect: async (where: { id: string }) =>
            database().organization.findFirst({
              select: { prefix: true },
              where: { id: where.id },
            }),
        } as unknown as OrganizationsService,
        new AgentThreadsService(asPrisma(), logger as never, {} as never),
        new AgentMessagesService(
          asPrisma(),
          logger as never,
          new AgentArtifactReferenceService(
            asPrisma() as never,
            logger as never,
          ),
        ),
        new AgentThreadSharesService(asPrisma(), threadAccess(), brandAccess()),
        { notifyReviewRequested: vi.fn() } as never,
      );

    let suffix: string;
    let organizationId: string;
    let brandA: string;
    let brandB: string;
    let requester: string;
    let reviewer: string;
    let secondReviewer: string;
    let brandBOnly: string;
    let admin: string;
    let outsider: string;
    let asset: string;
    let assetInBrandB: string;

    const id = (label: string) => `${label}-${suffix}`;
    const actor = (userId: string) => ({ organizationId, userId });

    async function createUser(userId: string) {
      await database().user.create({ data: { handle: userId, id: userId } });
      return userId;
    }

    async function createMember(
      userId: string,
      roleKey: MemberRole,
      brandIds: string[],
    ) {
      const role = await database().role.upsert({
        create: { key: roleKey, label: roleKey },
        update: {},
        where: { key: roleKey },
      });
      return database().member.create({
        data: {
          brands: { connect: brandIds.map((brandId) => ({ id: brandId })) },
          currentBrandId: brandIds[0] ?? brandA,
          organizationId,
          roleId: role.id,
          roleKey,
          userId,
        },
      });
    }

    async function createAsset(brandId: string) {
      const metadata = await database().metadata.create({
        data: { extension: 'PNG', label: 'Launch hero' },
      });
      const ingredient = await database().ingredient.create({
        data: { brandId, metadataId: metadata.id, organizationId },
      });
      return ingredient.id;
    }

    async function decide(taskId: string, reviewState: string) {
      await database().task.updateMany({
        data: { reviewState },
        where: { id: taskId, organizationId },
      });
    }

    beforeEach(async () => {
      vi.clearAllMocks();
      suffix = randomUUID();
      requester = await createUser(id('requester'));
      reviewer = await createUser(id('reviewer'));
      secondReviewer = await createUser(id('second-reviewer'));
      brandBOnly = await createUser(id('brand-b-only'));
      admin = await createUser(id('admin'));
      outsider = await createUser(id('outsider'));
      organizationId = id('org');
      await database().organization.create({
        data: {
          id: organizationId,
          label: organizationId,
          prefix: 'RV',
          slug: organizationId,
          userId: requester,
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
              userId: requester,
            },
          });
          return brandId;
        }),
      )) as [string, string];
      await createMember(requester, MemberRole.CREATOR, [brandA]);
      await createMember(reviewer, MemberRole.CREATOR, [brandA]);
      await createMember(secondReviewer, MemberRole.CREATOR, [brandA]);
      await createMember(brandBOnly, MemberRole.CREATOR, [brandB]);
      await createMember(admin, MemberRole.ADMIN, []);
      asset = await createAsset(brandA);
      assetInBrandB = await createAsset(brandB);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    describe('requesting a review', () => {
      it('creates a pending review task for the reviewer, linked to the asset', async () => {
        const [task] = await service().request(actor(requester), asset, {
          note: 'Is the logo placement right?',
          reviewerUserIds: [reviewer],
        });

        expect(task).toMatchObject({
          assigneeUserId: reviewer,
          brandId: brandA,
          description: 'Is the logo placement right?',
          identifier: expect.stringMatching(/^RV-\d+$/),
          linkedEntities: [{ entityId: asset, entityModel: 'Ingredient' }],
          reviewState: 'pending_approval',
          status: 'in_review',
          title: 'Review: Launch hero',
          userId: requester,
        });
      });

      it('shares a thread seeded with the asset with the reviewer at the prompt level', async () => {
        const [task] = await service().request(actor(requester), asset, {
          reviewerUserIds: [reviewer],
        });
        const threadId = task?.planningThreadId as string;

        expect(threadId).toBeTruthy();
        const thread = await database().agentThread.findFirstOrThrow({
          where: { id: threadId, organizationId },
        });
        expect(thread).toMatchObject({
          brandId: brandA,
          kind: AgentThreadKind.THREAD,
          source: 'review-request',
          userId: requester,
        });
        const [seed] = await database().agentMessage.findMany({
          where: { organizationId, threadId },
        });
        expect(seed?.artifactReferences).toEqual([
          expect.objectContaining({
            kind: 'ingredient',
            organizationId,
            recordId: asset,
          }),
        ]);
        await expect(
          threadAccess().assertAccess(actor(reviewer), threadId, 'collaborate'),
        ).resolves.toMatchObject({
          accessLevel: AgentThreadAccessLevel.COLLABORATE,
        });
        await expect(
          threadAccess().assertAccess(actor(secondReviewer), threadId, 'view'),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('creates one task and one private thread for each reviewer', async () => {
        const tasks = await service().request(actor(requester), asset, {
          reviewerUserIds: [reviewer, secondReviewer],
        });

        expect(tasks.map((task) => task.assigneeUserId)).toEqual([
          reviewer,
          secondReviewer,
        ]);
        const [first, second] = tasks;
        expect(first?.planningThreadId).not.toEqual(second?.planningThreadId);
        await expect(
          threadAccess().assertAccess(
            actor(reviewer),
            second?.planningThreadId as string,
            'view',
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('returns the open request instead of asking the same reviewer twice', async () => {
        const [first] = await service().request(actor(requester), asset, {
          reviewerUserIds: [reviewer],
        });
        const [again] = await service().request(actor(requester), asset, {
          reviewerUserIds: [reviewer],
        });

        expect(again?.id).toEqual(first?.id);
        expect(
          await database().task.count({
            where: { assigneeUserId: reviewer, organizationId },
          }),
        ).toBe(1);
      });

      it('cannot choose a member without access to the asset brand, and creates nothing', async () => {
        await expect(
          service().request(actor(requester), asset, {
            reviewerUserIds: [reviewer, brandBOnly],
          }),
        ).rejects.toEqual(new ForbiddenException('Brand access denied'));

        expect(await database().task.count({ where: { organizationId } })).toBe(
          0,
        );
        expect(
          await database().agentThread.count({ where: { organizationId } }),
        ).toBe(0);
      });

      it('gives a person outside the organization the same denial', async () => {
        await expect(
          service().request(actor(requester), asset, {
            reviewerUserIds: [outsider],
          }),
        ).rejects.toEqual(new ForbiddenException('Brand access denied'));
      });

      it('lets an admin, who reaches every brand, be chosen', async () => {
        const [task] = await service().request(actor(requester), asset, {
          reviewerUserIds: [admin],
        });

        expect(task?.assigneeUserId).toBe(admin);
      });

      it('refuses a request to yourself', async () => {
        await expect(
          service().request(actor(requester), asset, {
            reviewerUserIds: [requester],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('treats an asset the requester cannot reach like a missing one', async () => {
        await expect(
          service().request(actor(requester), assetInBrandB, {
            reviewerUserIds: [reviewer],
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
          service().request(actor(requester), 'no-such-asset', {
            reviewerUserIds: [reviewer],
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    describe('deciding a review', () => {
      async function requestFromReviewer() {
        const [task] = await service().request(actor(requester), asset, {
          reviewerUserIds: [reviewer],
        });
        return {
          assigneeUserId: reviewer,
          brandId: brandA,
          id: task?.id as string,
          userId: requester,
        };
      }

      it('lets the assigned reviewer approve or request changes', async () => {
        const task = await requestFromReviewer();

        for (const decision of ['approved', 'changes_requested'] as const) {
          await expect(
            reviewAccess().assertCanDecide(actor(reviewer), task, decision),
          ).resolves.toBeUndefined();
        }
      });

      it('lets an organization admin decide', async () => {
        const task = await requestFromReviewer();

        await expect(
          reviewAccess().assertCanDecide(actor(admin), task, 'approved'),
        ).resolves.toBeUndefined();
      });

      it('refuses the requester and any other member, whatever the decision', async () => {
        const task = await requestFromReviewer();

        for (const member of [requester, secondReviewer, brandBOnly]) {
          for (const decision of ['approved', 'changes_requested'] as const) {
            await expect(
              reviewAccess().assertCanDecide(actor(member), task, decision),
            ).rejects.toBeInstanceOf(ForbiddenException);
          }
        }
      });

      it('lets the requester withdraw the request, but nobody else', async () => {
        const task = await requestFromReviewer();

        await expect(
          reviewAccess().assertCanDecide(actor(requester), task, 'dismissed'),
        ).resolves.toBeUndefined();
        await expect(
          reviewAccess().assertCanDecide(
            actor(secondReviewer),
            task,
            'dismissed',
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('stops honoring the reviewer once their brand access is removed', async () => {
        const task = await requestFromReviewer();
        const membership = await database().member.findFirstOrThrow({
          where: { organizationId, userId: reviewer },
        });
        await database().member.update({
          data: { brands: { set: [] } },
          where: { id: membership.id },
        });

        await expect(
          reviewAccess().assertCanDecide(actor(reviewer), task, 'approved'),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('keeps another member from taking over the review', async () => {
        const task = await requestFromReviewer();

        await expect(
          reviewAccess().assertCanChangeReviewer(actor(secondReviewer), task),
        ).rejects.toBeInstanceOf(ForbiddenException);
        for (const member of [requester, reviewer, admin]) {
          await expect(
            reviewAccess().assertCanChangeReviewer(actor(member), task),
          ).resolves.toBeUndefined();
        }
      });

      it('leaves a task nobody is assigned to open to any member', async () => {
        const open = { assigneeUserId: null, brandId: brandA, userId: null };

        await expect(
          reviewAccess().assertCanDecide(
            actor(secondReviewer),
            open,
            'approved',
          ),
        ).resolves.toBeUndefined();
      });
    });

    describe('seeing the decisions', () => {
      it("shows the requester each reviewer's decision, and a reviewer only their own", async () => {
        const [first, second] = await service().request(
          actor(requester),
          asset,
          { reviewerUserIds: [reviewer, secondReviewer] },
        );
        await decide(first?.id as string, 'approved');
        await decide(second?.id as string, 'changes_requested');

        const asRequester = await service().list(actor(requester), asset);
        expect(
          asRequester.map((task) => [task.assigneeUserId, task.reviewState]),
        ).toEqual([
          [reviewer, 'approved'],
          [secondReviewer, 'changes_requested'],
        ]);
        const asReviewer = await service().list(actor(reviewer), asset);
        expect(asReviewer.map((task) => task.assigneeUserId)).toEqual([
          reviewer,
        ]);
        const asAdmin = await service().list(actor(admin), asset);
        expect(asAdmin).toHaveLength(2);
      });

      it('shows nothing to a member who neither asked nor was asked', async () => {
        await service().request(actor(requester), asset, {
          reviewerUserIds: [reviewer],
        });
        await createMember(
          await createUser(id('bystander')),
          MemberRole.CREATOR,
          [brandA],
        );

        expect(await service().list(actor(id('bystander')), asset)).toEqual([]);
      });

      it('does not list reviews requested on another asset', async () => {
        const other = await createAsset(brandA);
        await service().request(actor(requester), other, {
          reviewerUserIds: [reviewer],
        });

        expect(await service().list(actor(requester), asset)).toEqual([]);
      });
    });

    describe('reviewer candidates', () => {
      it('offers active members who reach the asset brand, never the requester', async () => {
        const candidates = await service().listReviewerCandidates(
          actor(requester),
          asset,
        );

        expect([...candidates].sort()).toEqual(
          [admin, reviewer, secondReviewer].sort(),
        );
      });

      it('leaves out members who cannot see the asset brand', async () => {
        const candidates = await service().listReviewerCandidates(
          actor(admin),
          assetInBrandB,
        );

        expect(candidates).not.toContain(reviewer);
        expect(candidates).toContain(brandBOnly);
      });
    });

    describe('review state on the Library (#9948)', () => {
      const reviewStates = () => new IngredientReviewStateService(asPrisma());
      const listed = async (review: LibraryReviewState) =>
        (
          await database().ingredient.findMany({
            select: { id: true },
            where: { organizationId, ...reviewStates().buildFilter(review) },
          })
        ).map((row) => row.id);

      it('reports no state for an asset nobody was asked to review', async () => {
        const states = await reviewStates().summarize(organizationId, [asset]);

        expect(states.get(asset)).toBeUndefined();
      });

      it('sums the requests: changes requested beats in review, approved needs every request approved', async () => {
        const [first, second] = await service().request(
          actor(requester),
          asset,
          { reviewerUserIds: [reviewer, secondReviewer] },
        );
        const stateOf = async () =>
          (await reviewStates().summarize(organizationId, [asset])).get(asset);

        expect(await stateOf()).toBe(LibraryReviewState.IN_REVIEW);
        await decide(first?.id as string, 'approved');
        expect(await stateOf()).toBe(LibraryReviewState.IN_REVIEW);
        await decide(second?.id as string, 'changes_requested');
        expect(await stateOf()).toBe(LibraryReviewState.CHANGES_REQUESTED);
        await decide(second?.id as string, 'approved');
        expect(await stateOf()).toBe(LibraryReviewState.APPROVED);
      });

      it('lists each asset under the one filter that matches its summed state', async () => {
        const [first, second] = await service().request(
          actor(requester),
          asset,
          { reviewerUserIds: [reviewer, secondReviewer] },
        );

        expect(await listed(LibraryReviewState.IN_REVIEW)).toEqual([asset]);
        await decide(first?.id as string, 'approved');
        await decide(second?.id as string, 'changes_requested');

        expect(await listed(LibraryReviewState.IN_REVIEW)).toEqual([]);
        expect(await listed(LibraryReviewState.APPROVED)).toEqual([]);
        expect(await listed(LibraryReviewState.CHANGES_REQUESTED)).toEqual([
          asset,
        ]);
        await decide(second?.id as string, 'approved');
        expect(await listed(LibraryReviewState.APPROVED)).toEqual([asset]);
      });

      it('ignores a dismissed request', async () => {
        const [task] = await service().request(actor(requester), asset, {
          reviewerUserIds: [reviewer],
        });
        await decide(task?.id as string, 'dismissed');

        expect(
          (await reviewStates().summarize(organizationId, [asset])).get(asset),
        ).toBeUndefined();
        expect(await listed(LibraryReviewState.IN_REVIEW)).toEqual([]);
      });
    });
  },
);
