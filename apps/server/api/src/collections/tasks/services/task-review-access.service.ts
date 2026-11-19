import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  type BrandAccessActor,
  BrandAccessService,
} from '@api/authorization/brand-access/brand-access.service';
import type { UpdateTaskDto } from '@api/collections/tasks/dto/update-task.dto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { isCloudDeployment } from '@genfeedai/config';
import { MemberRole } from '@genfeedai/contracts';
import { Traced } from '@libs/tracing/traced';
import { ForbiddenException, Injectable } from '@nestjs/common';

/** The task columns the review access rules read. */
export interface TaskReviewAccessRow {
  assigneeUserId?: string | null;
  brandId?: string | null;
  userId?: string | null;
}

export type TaskReviewDecision = 'approved' | 'changes_requested' | 'dismissed';

/**
 * Who may decide a review (#9945). A task with a human reviewer is decided by
 * that reviewer, who must still reach the task's brand, or by an organization
 * owner or admin. The requester may also dismiss, which withdraws the request.
 * A task nobody is assigned to keeps the open rule: any member of the
 * organization. Nothing is cached: role and brand access are read on each call.
 */
@Traced()
@Injectable()
export class TaskReviewAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
  ) {}

  async assertCanPatchTask(
    user: User,
    taskId: string,
    { assigneeUserId, brandId, isDeleted }: UpdateTaskDto,
    isSuperAdmin: boolean,
  ): Promise<void> {
    const isChangingReviewer = assigneeUserId !== undefined || isDeleted;
    if (isSuperAdmin && !isChangingReviewer) return;

    const actor = this.actorOf(user);
    const task = await this.requireTask(actor.organizationId, taskId);
    if (!isSuperAdmin) {
      await this.assertCanAccessBrand(actor, task.brandId);
      if (brandId && brandId !== task.brandId) {
        await this.assertCanAccessBrand(actor, brandId);
      }
    }
    if (isChangingReviewer) await this.assertCanChangeReviewer(actor, task);
    if (assigneeUserId && isCloudDeployment()) {
      const assignee = {
        organizationId: actor.organizationId,
        userId: assigneeUserId,
      };
      try {
        await this.assertCanAccessBrand(
          assignee,
          brandId === undefined ? task.brandId : brandId,
        );
      } catch (error: unknown) {
        if (!(error instanceof ForbiddenException)) throw error;
        throw new ForbiddenException(
          'The assignee must be an active workspace member with access to this task.',
        );
      }
    }
  }

  private async assertCanAccessBrand(
    actor: BrandAccessActor,
    brandId: string | null | undefined,
  ): Promise<void> {
    if (brandId) {
      await this.brandAccess.assert(actor, brandId);
    } else {
      await this.brandAccess.resolve(actor);
    }
  }

  /** {@link assertCanDecide} for the task `taskId` of the caller's organization. */
  async assertCanDecideTask(
    user: User,
    taskId: string,
    decision: TaskReviewDecision | undefined,
  ): Promise<void> {
    if (!decision) {
      return;
    }
    await this.assertCanDecide(
      this.actorOf(user),
      await this.requireTask(user.organizationId, taskId),
      decision,
    );
  }

  async assertCanDecide(
    actor: BrandAccessActor,
    task: TaskReviewAccessRow,
    decision: TaskReviewDecision,
  ): Promise<void> {
    if (!task.assigneeUserId) {
      return;
    }
    if (decision === 'dismissed' && task.userId === actor.userId) {
      return;
    }
    if (await this.isReviewerOrAdmin(actor, task)) {
      return;
    }
    throw new ForbiddenException(
      'Only the assigned reviewer or an organization admin can decide this review.',
    );
  }

  /**
   * Changing or clearing the reviewer, or deleting the task, is for the
   * reviewer, the requester or an admin: any other member could otherwise
   * assign themselves and approve.
   */
  async assertCanChangeReviewer(
    actor: BrandAccessActor,
    task: TaskReviewAccessRow,
  ): Promise<void> {
    if (!task.assigneeUserId || task.userId === actor.userId) {
      return;
    }
    if (await this.isReviewerOrAdmin(actor, task)) {
      return;
    }
    throw new ForbiddenException(
      'Only the reviewer, the requester or an organization admin can change this review.',
    );
  }

  /** Whether the actor's live role is organization owner or admin. */
  async isAdmin(actor: BrandAccessActor): Promise<boolean> {
    if (!isCloudDeployment()) {
      // Self-hosted is single-tenant: there is no member role to check.
      return true;
    }
    try {
      const { role } = await this.brandAccess.resolve(actor);
      return role === MemberRole.OWNER || role === MemberRole.ADMIN;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return false;
      }
      throw error;
    }
  }

  private async isReviewerOrAdmin(
    actor: BrandAccessActor,
    task: TaskReviewAccessRow,
  ): Promise<boolean> {
    if (await this.isAdmin(actor)) {
      return true;
    }
    if (task.assigneeUserId !== actor.userId) {
      return false;
    }
    try {
      if (task.brandId) {
        await this.brandAccess.assert(actor, task.brandId);
      } else {
        await this.brandAccess.resolve(actor);
      }
      return true;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return false;
      }
      throw error;
    }
  }

  private actorOf(user: User): BrandAccessActor {
    return {
      apiKeyId: user.apiKeyId,
      isApiKey: user.isApiKey,
      organizationId: user.organizationId,
      scopes: user.scopes,
      userId: user.userId ?? user.id,
    };
  }

  private async requireTask(
    organizationId: string,
    taskId: string,
  ): Promise<TaskReviewAccessRow> {
    const task = await this.prisma.task.findFirst({
      select: { assigneeUserId: true, brandId: true, userId: true },
      where: scopedWhere(organizationId, { id: taskId }),
    });
    if (!task) {
      throw new NotFoundException('Task', taskId);
    }
    return task;
  }
}
