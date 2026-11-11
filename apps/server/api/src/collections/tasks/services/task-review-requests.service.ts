import {
  type BrandAccessActor,
  BrandAccessService,
} from '@api/authorization/brand-access/brand-access.service';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadSharesService } from '@api/collections/agent-threads/services/agent-thread-shares.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { TaskCountersService } from '@api/collections/task-counters/services/task-counters.service';
import type { CreateTaskReviewRequestDto } from '@api/collections/tasks/dto/create-task-review-request.dto';
import type { TaskDocument } from '@api/collections/tasks/schemas/task.schema';
import { TaskReviewAccessService } from '@api/collections/tasks/services/task-review-access.service';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  AgentMessageRole,
  AgentThreadMode,
  AgentThreadShareLevel,
  AgentThreadShareScope,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/** Marks the threads this service starts, so they can be told apart. */
const REVIEW_REQUEST_THREAD_SOURCE = 'review-request';

const LIST_LIMIT = 100;

interface ReviewedAsset {
  brandId: string | null;
  id: string;
  label: string | null;
}

/**
 * Asks teammates to review a Library asset (#9945). Each reviewer gets their
 * own review task (the existing review gate: `pending_approval`, the reviewer
 * as assignee, the asset as a linked entity) and their own agent thread, seeded
 * with the asset and shared with them at the "can prompt" level.
 *
 * A reviewer must be an active member who reaches the asset's brand. Anyone
 * else, a member without that access included, is refused with the same denial
 * as an inaccessible brand, and nothing is created for any reviewer.
 */
@Traced()
@Injectable()
export class TaskReviewRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
    private readonly reviewAccess: TaskReviewAccessService,
    private readonly tasksService: TasksService,
    private readonly taskCountersService: TaskCountersService,
    private readonly organizationsService: OrganizationsService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly agentThreadSharesService: AgentThreadSharesService,
  ) {}

  /** Creates one review task and thread per reviewer, or returns the open one. */
  async request(
    actor: BrandAccessActor,
    ingredientId: string,
    input: CreateTaskReviewRequestDto,
  ): Promise<TaskDocument[]> {
    const asset = await this.requireAsset(actor, ingredientId);

    const reviewerUserIds = [...new Set(input.reviewerUserIds)];
    if (reviewerUserIds.includes(actor.userId)) {
      throw new BadRequestException('You cannot ask yourself to review.');
    }
    for (const reviewerUserId of reviewerUserIds) {
      await this.assertEligibleReviewer(actor.organizationId, asset, {
        organizationId: actor.organizationId,
        userId: reviewerUserId,
      });
    }

    const tasks: TaskDocument[] = [];
    for (const reviewerUserId of reviewerUserIds) {
      const open = await this.findOpenRequest(actor, asset, reviewerUserId);
      tasks.push(
        open ??
          (await this.createRequest(actor, asset, reviewerUserId, input.note)),
      );
    }
    return tasks;
  }

  /**
   * The review requests on an asset the actor may see: their own requests and
   * the ones assigned to them, or all of them for an organization admin.
   */
  async list(
    actor: BrandAccessActor,
    ingredientId: string,
  ): Promise<TaskDocument[]> {
    const asset = await this.requireAsset(actor, ingredientId);
    const isAdmin = await this.reviewAccess.isAdmin(actor);
    const rows = await this.prisma.task.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: LIST_LIMIT,
      where: scopedWhere(actor.organizationId, {
        ...this.linkedToAsset(asset.id),
        assigneeUserId: { not: null },
        reviewState: { not: 'none' },
        ...(isAdmin
          ? {}
          : {
              OR: [{ userId: actor.userId }, { assigneeUserId: actor.userId }],
            }),
      }),
    });
    return rows.map((row) => this.tasksService.normalizeTaskDocument(row));
  }

  /**
   * Teammates the actor may ask to review the asset: the active members, other
   * than the actor, who reach its brand. The same rule `request` enforces, so a
   * picker can offer exactly the people a request would accept.
   */
  async listReviewerCandidates(
    actor: BrandAccessActor,
    ingredientId: string,
  ): Promise<string[]> {
    const asset = await this.requireAsset(actor, ingredientId);
    const members = await this.prisma.member.findMany({
      select: { userId: true },
      where: {
        isActive: true,
        isDeleted: false,
        organizationId: actor.organizationId,
        userId: { not: actor.userId },
      },
    });
    const eligible: string[] = [];
    for (const { userId } of members) {
      try {
        await this.assertReaches(
          { organizationId: actor.organizationId, userId },
          asset.brandId,
        );
        eligible.push(userId);
      } catch (error: unknown) {
        if (!(error instanceof ForbiddenException)) {
          throw error;
        }
      }
    }
    return eligible;
  }

  private async createRequest(
    actor: BrandAccessActor,
    asset: ReviewedAsset,
    reviewerUserId: string,
    note: string | undefined,
  ): Promise<TaskDocument> {
    const title = `Review: ${asset.label ?? 'asset'}`;
    const thread = await this.agentThreadsService.create({
      brandId: asset.brandId,
      mode: AgentThreadMode.MANUAL,
      organizationId: actor.organizationId,
      source: REVIEW_REQUEST_THREAD_SOURCE,
      title,
      userId: actor.userId,
    } as Record<string, unknown>);
    const threadId = String((thread as Record<string, unknown>).id);

    try {
      await this.agentMessagesService.addMessage({
        artifactReferences: [
          {
            ...(asset.brandId ? { brandId: asset.brandId } : {}),
            kind: 'ingredient',
            organizationId: actor.organizationId,
            recordId: asset.id,
            serializer: 'ingredient',
          },
        ],
        content: note?.trim()
          ? `Please review this asset. ${note.trim()}`
          : 'Please review this asset.',
        ...(asset.brandId ? { brandId: asset.brandId } : {}),
        organizationId: actor.organizationId,
        role: AgentMessageRole.USER,
        room: threadId,
        userId: actor.userId,
      });
      await this.agentThreadSharesService.grant(actor, threadId, {
        level: AgentThreadShareLevel.COLLABORATE,
        scope: AgentThreadShareScope.MEMBER,
        targetUserId: reviewerUserId,
      });
      return await this.createTask(
        actor,
        asset,
        reviewerUserId,
        threadId,
        title,
        note,
      );
    } catch (error: unknown) {
      // Do not leave a thread behind for a request that was not made.
      await this.prisma.agentThread.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(actor.organizationId, { id: threadId }),
      });
      throw error;
    }
  }

  private async createTask(
    actor: BrandAccessActor,
    asset: ReviewedAsset,
    reviewerUserId: string,
    threadId: string,
    title: string,
    note: string | undefined,
  ): Promise<TaskDocument> {
    const organization = await this.organizationsService.findOneSelect(
      { id: actor.organizationId },
      { prefix: true },
    );
    if (!organization?.prefix) {
      throw new BadRequestException(
        'Organization must have a prefix set before creating tasks',
      );
    }
    const taskNumber = await this.taskCountersService.getNextNumber(
      actor.organizationId,
    );

    return this.tasksService.create({
      assigneeUserId: reviewerUserId,
      brandId: asset.brandId ?? undefined,
      description: note?.trim() || undefined,
      identifier: `${organization.prefix}-${taskNumber}`,
      linkedEntities: [{ entityId: asset.id, entityModel: 'Ingredient' }],
      linkedOutputIds: [asset.id],
      organizationId: actor.organizationId,
      planningThreadId: threadId,
      reviewState: 'pending_approval',
      status: 'in_review',
      taskNumber,
      title,
      userId: actor.userId,
    } as unknown as Parameters<TasksService['create']>[0]);
  }

  /** The reviewer's pending request from this requester on this asset, if any. */
  private async findOpenRequest(
    actor: BrandAccessActor,
    asset: ReviewedAsset,
    reviewerUserId: string,
  ): Promise<TaskDocument | null> {
    const row = await this.prisma.task.findFirst({
      where: scopedWhere(actor.organizationId, {
        ...this.linkedToAsset(asset.id),
        assigneeUserId: reviewerUserId,
        reviewState: 'pending_approval',
        userId: actor.userId,
      }),
    });
    return row ? this.tasksService.normalizeTaskDocument(row) : null;
  }

  private linkedToAsset(ingredientId: string): Prisma.TaskWhereInput {
    return { linkedOutputs: { some: { id: ingredientId } } };
  }

  /**
   * The asset, if it exists in the organization and the actor reaches its
   * brand. A missing asset and one the actor cannot reach look the same.
   */
  private async requireAsset(
    actor: BrandAccessActor,
    ingredientId: string,
  ): Promise<ReviewedAsset> {
    const row = await this.prisma.ingredient.findFirst({
      select: {
        brandId: true,
        id: true,
        metadata: { select: { label: true } },
      },
      where: scopedWhere(actor.organizationId, { id: ingredientId }),
    });
    if (!row) {
      throw new NotFoundException('Ingredient', ingredientId);
    }
    try {
      await this.assertReaches(actor, row.brandId);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        throw new NotFoundException('Ingredient', ingredientId);
      }
      throw error;
    }
    return {
      brandId: row.brandId,
      id: row.id,
      label: row.metadata?.label ?? null,
    };
  }

  /** An active member of the organization who reaches the asset's brand. */
  private async assertEligibleReviewer(
    organizationId: string,
    asset: ReviewedAsset,
    reviewer: BrandAccessActor,
  ): Promise<void> {
    const member = await this.prisma.member.findFirst({
      select: { id: true },
      where: {
        isActive: true,
        isDeleted: false,
        organizationId,
        userId: reviewer.userId,
      },
    });
    if (!member) {
      throw new ForbiddenException('Brand access denied');
    }
    await this.assertReaches(reviewer, asset.brandId);
  }

  private async assertReaches(
    actor: BrandAccessActor,
    brandId: string | null,
  ): Promise<void> {
    if (brandId) {
      await this.brandAccess.assert(actor, brandId);
    } else {
      await this.brandAccess.resolve(actor);
    }
  }
}
