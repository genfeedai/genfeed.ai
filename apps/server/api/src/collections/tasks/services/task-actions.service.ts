import { randomUUID } from 'node:crypto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { type TaskDocument } from '@api/collections/tasks/schemas/task.schema';
import type { TasksService } from '@api/collections/tasks/services/tasks.service';
import { TASKS_SERVICE } from '@api/collections/tasks/tasks.tokens';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  buildWorkspaceTaskRealtimeSnapshot,
  serializeWorkspaceTaskProgress,
  type WorkspaceTaskProgressSnapshot,
} from '@genfeedai/serializers';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';

export type TaskEventInput = {
  payload?: Record<string, unknown>;
  timestamp?: Date;
  type: string;
};

type TaskRealtimePayload = {
  event: {
    id: string;
    payload?: Record<string, unknown>;
    timestamp: string;
    type: string;
  };
  organizationId: string;
  progress: WorkspaceTaskProgressSnapshot;
  room: string;
  task: Record<string, unknown>;
  taskId: string;
  userId: string;
};

type OutputIdArrayField = 'approvedOutputIds' | 'linkedOutputIds';

type TaskDelegate = {
  findFirst: (args: { where: Record<string, unknown> }) => Promise<unknown>;
  update: (args: {
    data: Record<string, unknown>;
    where: Record<string, unknown>;
  }) => Promise<unknown>;
};

/**
 * Review-gate transitions, output-array mutations, and the realtime
 * event-broadcast machinery for tasks. Extracted out of `TasksService` so the
 * latter stays a thin persistence/CRUD/lifecycle surface. `TasksService` keeps
 * thin delegators to these methods, so the HTTP contract is unchanged.
 */
@Injectable()
export class TaskActionsService {
  constructor(
    @Inject(TASKS_SERVICE)
    private readonly tasksService: TasksService,
    private readonly prisma: PrismaService,
    private readonly ingredientsService: IngredientsService,
    private readonly notificationsPublisher: NotificationsPublisherService,
  ) {}

  private get delegate(): TaskDelegate {
    return (this.prisma as unknown as Record<string, TaskDelegate>).task;
  }

  async approve(id: string, organizationId: string): Promise<TaskDocument> {
    const task = await this.tasksService.requireTask(id, organizationId);
    const updated = await this.applyReviewTransition(id, {
      completedAt: new Date(),
      reviewState: 'approved',
      status: 'done',
      dismissedReason: null,
      failureReason: null,
      requestedChangesReason: null,
    });
    const userId = task.assigneeUserId ?? '';
    await this.appendEventAndBroadcast(updated, organizationId, userId, {
      type: 'task_approved',
    });
    return updated;
  }

  async requestChanges(
    id: string,
    organizationId: string,
    userId: string,
    reason: string,
  ): Promise<TaskDocument> {
    await this.tasksService.requireTask(id, organizationId);
    const updated = await this.applyReviewTransition(id, {
      requestedChangesReason: reason,
      reviewState: 'changes_requested',
      status: 'in_review',
      dismissedReason: null,
    });
    await this.appendEventAndBroadcast(updated, organizationId, userId, {
      payload: { reason },
      type: 'task_changes_requested',
    });
    return updated;
  }

  async dismiss(
    id: string,
    organizationId: string,
    userId: string,
    reason?: string,
  ): Promise<TaskDocument> {
    await this.tasksService.requireTask(id, organizationId);
    const updated = await this.applyReviewTransition(id, {
      dismissedAt: new Date(),
      dismissedReason: reason ?? null,
      reviewState: 'dismissed',
      status: 'cancelled',
      failureReason: null,
      requestedChangesReason: null,
    });
    await this.appendEventAndBroadcast(updated, organizationId, userId, {
      payload: reason ? { reason } : undefined,
      type: 'task_dismissed',
    });
    return updated;
  }

  async keepOutput(
    id: string,
    outputId: string,
    organizationId: string,
  ): Promise<TaskDocument> {
    const task = await this.requireLinkedOutputTask(
      id,
      organizationId,
      outputId,
    );
    const updated = await this.mutateOutputIdArray(
      id,
      organizationId,
      'approvedOutputIds',
      'add',
      outputId,
    );
    const userId = task.assigneeUserId ?? '';
    await this.appendEventAndBroadcast(updated, organizationId, userId, {
      payload: { outputId },
      type: 'output_kept',
    });
    return updated;
  }

  async unkeepOutput(
    id: string,
    outputId: string,
    organizationId: string,
  ): Promise<TaskDocument> {
    const task = await this.requireLinkedOutputTask(
      id,
      organizationId,
      outputId,
    );
    const updated = await this.mutateOutputIdArray(
      id,
      organizationId,
      'approvedOutputIds',
      'remove',
      outputId,
    );
    const userId = task.assigneeUserId ?? '';
    await this.appendEventAndBroadcast(updated, organizationId, userId, {
      payload: { outputId },
      type: 'output_unkept',
    });
    return updated;
  }

  async trashOutput(
    id: string,
    outputId: string,
    organizationId: string,
  ): Promise<TaskDocument> {
    const task = await this.requireLinkedOutputTask(
      id,
      organizationId,
      outputId,
    );
    const ingredient = await this.ingredientsService.findOne({
      id: outputId,
      isDeleted: false,
      organizationId,
    });
    if (!ingredient) throw new NotFoundException('Ingredient', outputId);
    await this.ingredientsService.patch(outputId, { isDeleted: true });
    const updated = await this.mutateOutputIdArray(
      id,
      organizationId,
      'approvedOutputIds',
      'remove',
      outputId,
    );
    const userId = task.assigneeUserId ?? '';
    await this.appendEventAndBroadcast(updated, organizationId, userId, {
      payload: { outputId },
      type: 'output_trashed',
    });
    return updated;
  }

  async attachOutput(
    id: string,
    outputId: string,
    organizationId: string,
    userId: string,
  ): Promise<TaskDocument> {
    await this.tasksService.requireTask(id, organizationId);
    const updated = await this.mutateOutputIdArray(
      id,
      organizationId,
      'linkedOutputIds',
      'add',
      outputId,
    );
    await this.appendEventAndBroadcast(updated, organizationId, userId, {
      payload: { outputId },
      type: 'output_attached',
    });
    return updated;
  }

  async recordTaskEvent(
    id: string,
    organizationId: string,
    userId: string,
    event: TaskEventInput,
    patch: Record<string, unknown> = {},
  ): Promise<TaskDocument> {
    const task = await this.tasksService.requireTask(id, organizationId);
    const updated = await this.patchTaskAndReturn(id, organizationId, patch);
    await this.appendEventAndBroadcast(
      updated ?? task,
      organizationId,
      userId,
      event,
    );
    return updated ?? task;
  }

  /**
   * Update a task and return it, or throw the canonical not-found. Shared by
   * the review-action methods (approve / requestChanges / dismiss).
   */
  private async applyReviewTransition(
    id: string,
    data: Record<string, unknown>,
  ): Promise<TaskDocument> {
    const updated = (await this.delegate.update({
      data,
      where: { id },
    })) as unknown as TaskDocument | null;
    if (!updated) throw new NotFoundException('Task', id);
    return updated;
  }

  /**
   * Add/remove an outputId on a task's id-array field (dedup on add, filter on
   * remove). Shared by keepOutput / unkeepOutput / trashOutput / attachOutput.
   */
  private async mutateOutputIdArray(
    id: string,
    organizationId: string,
    field: OutputIdArrayField,
    op: 'add' | 'remove',
    outputId: string,
  ): Promise<TaskDocument> {
    const current = (await this.delegate.findFirst({
      where: { id, isDeleted: false, organizationId },
    })) as Record<string, unknown> | null;
    const existingIds = (current?.[field] as string[] | undefined) ?? [];
    const nextIds =
      op === 'add'
        ? Array.from(new Set([...existingIds, outputId]))
        : existingIds.filter((oid) => oid !== outputId);
    const updated = (await this.delegate.update({
      data: { [field]: nextIds },
      where: { id },
    })) as unknown as TaskDocument | null;
    if (!updated) throw new NotFoundException('Task', id);
    return updated;
  }

  private async patchTaskAndReturn(
    id: string,
    organizationId: string,
    patch: Record<string, unknown>,
  ): Promise<TaskDocument | null> {
    if (Object.keys(patch).length === 0) {
      return this.tasksService.findOne({
        id,
        isDeleted: false,
        organizationId,
      });
    }
    return (await this.delegate.update({
      data: patch,
      where: { id },
    })) as unknown as TaskDocument | null;
  }

  private async requireLinkedOutputTask(
    id: string,
    organizationId: string,
    outputId: string,
  ): Promise<TaskDocument> {
    const task = await this.tasksService.requireTask(id, organizationId);
    const linkedOutputIds = task.linkedOutputIds ?? [];
    const isLinked = linkedOutputIds.some(
      (linkedOutputId) => linkedOutputId.toString() === outputId,
    );
    if (!isLinked)
      throw new BadRequestException(
        'This output is not linked to the requested task.',
      );
    return task;
  }

  private createTaskEventEntry(input: TaskEventInput): {
    createdAt: Date;
    id: string;
    payload?: Record<string, unknown>;
    timestamp: Date;
    type: string;
  } {
    const now = input.timestamp ?? new Date();
    return {
      createdAt: now,
      id: randomUUID(),
      payload: input.payload,
      timestamp: now,
      type: input.type,
    };
  }

  private async appendEventAndBroadcast(
    task: TaskDocument,
    organizationId: string,
    userId: string,
    eventInput: TaskEventInput,
  ): Promise<void> {
    const entry = this.createTaskEventEntry(eventInput);
    const taskId = (task as Record<string, unknown>).id as string;

    const eventDoc = {
      createdAt: entry.createdAt,
      id: entry.id,
      payload: entry.payload,
      timestamp: entry.timestamp,
      type: entry.type,
      userId: userId || undefined,
    };

    const current = (await this.delegate.findFirst({
      where: { id: taskId, isDeleted: false },
    })) as { eventStream?: unknown[] } | null;
    const currentStream = current?.eventStream ?? [];
    const newStream = [...currentStream, eventDoc];

    const updated = (await this.delegate.update({
      data: { eventStream: newStream },
      where: { id: taskId },
    })) as unknown as TaskDocument | null;

    if (!updated) return;

    const payload: TaskRealtimePayload = {
      event: {
        id: entry.id,
        payload: entry.payload,
        timestamp: entry.timestamp.toISOString(),
        type: entry.type,
      },
      organizationId,
      progress: serializeWorkspaceTaskProgress(updated.progress),
      room: `org-${organizationId}`,
      task: buildWorkspaceTaskRealtimeSnapshot(
        updated as unknown as Parameters<
          typeof buildWorkspaceTaskRealtimeSnapshot
        >[0],
      ),
      taskId,
      userId,
    };

    await Promise.all([
      this.notificationsPublisher.emit(
        WebSocketPaths.workspaceTask(taskId),
        payload,
      ),
      this.notificationsPublisher.emit(
        WebSocketPaths.workspaceTaskOverview(organizationId),
        payload,
      ),
    ]);
  }
}
