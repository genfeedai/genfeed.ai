import { TaskFeedbackMemoryAdapterService } from '@api/collections/agent-memories/services/task-feedback-memory-adapter.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { TaskDocument } from '@api/collections/tasks/schemas/task.schema';
import type { TasksService } from '@api/collections/tasks/services/tasks.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';

import { TaskActionsService } from './task-actions.service';

describe('TaskActionsService', () => {
  const organizationId = 'org-1';
  const taskId = 'task-1';
  const reviewerUserId = 'reviewer-1';
  const assigneeUserId = 'assignee-1';
  const outputId = 'output-1';

  const baseTask = {
    id: taskId,
    approvedOutputIds: [],
    assigneeUserId,
    brandId: 'brand-1',
    eventStream: [],
    identifier: 'GENA-12',
    linkedApprovalIds: [],
    linkedOutputIds: [outputId],
    linkedExecutionIds: [],
    organizationId,
    outputType: 'post',
    platforms: ['x'],
    priority: 'medium',
    request: 'Draft the launch update.',
    reviewState: 'pending_approval',
    reviewTriggered: true,
    skillVariantIds: [],
    skillsUsed: [],
    status: 'in_review',
    title: 'Launch update',
  } as unknown as TaskDocument;

  let currentTask: TaskDocument;
  let tasksService: {
    patch: ReturnType<typeof vi.fn>;
    requireTask: ReturnType<typeof vi.fn>;
  };
  let ingredientsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let notificationsPublisher: { emit: ReturnType<typeof vi.fn> };
  let taskFeedbackMemoryAdapter: {
    captureFromTaskReview: ReturnType<typeof vi.fn>;
  };
  let service: TaskActionsService;

  beforeEach(() => {
    currentTask = { ...baseTask, eventStream: [] };
    tasksService = {
      patch: vi.fn().mockImplementation((_id, data) => {
        currentTask = { ...currentTask, ...data };
        return Promise.resolve(currentTask);
      }),
      requireTask: vi
        .fn()
        .mockImplementation(() => Promise.resolve(currentTask)),
    };
    ingredientsService = {
      findOne: vi.fn().mockResolvedValue({ id: outputId }),
      patch: vi.fn().mockResolvedValue(undefined),
    };
    notificationsPublisher = {
      emit: vi.fn().mockResolvedValue(undefined),
    };
    taskFeedbackMemoryAdapter = {
      captureFromTaskReview: vi.fn().mockResolvedValue(true),
    };

    service = new TaskActionsService(
      tasksService as unknown as TasksService,
      ingredientsService as unknown as IngredientsService,
      notificationsPublisher as unknown as NotificationsPublisherService,
      taskFeedbackMemoryAdapter as unknown as TaskFeedbackMemoryAdapterService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('captures approval feedback memory with the reviewer user id', async () => {
    await service.approve(taskId, organizationId, reviewerUserId);

    expect(
      taskFeedbackMemoryAdapter.captureFromTaskReview,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'approved',
        organizationId,
        task: expect.objectContaining({
          completedAt: expect.any(Date),
          reviewState: 'approved',
          status: 'done',
        }),
        userId: reviewerUserId,
      }),
    );
  });

  it('captures requested-change feedback memory with the reviewer note', async () => {
    await service.requestChanges(
      taskId,
      organizationId,
      reviewerUserId,
      'Tighten the hook.',
    );

    expect(
      taskFeedbackMemoryAdapter.captureFromTaskReview,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'changes_requested',
        note: 'Tighten the hook.',
        organizationId,
        task: expect.objectContaining({
          requestedChangesReason: 'Tighten the hook.',
          reviewState: 'changes_requested',
        }),
        userId: reviewerUserId,
      }),
    );
  });

  it('captures kept output feedback memory with the output id', async () => {
    await service.keepOutput(taskId, outputId, organizationId, reviewerUserId);

    expect(
      taskFeedbackMemoryAdapter.captureFromTaskReview,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'output_kept',
        organizationId,
        outputId,
        task: expect.objectContaining({
          approvedOutputIds: [outputId],
        }),
        userId: reviewerUserId,
      }),
    );
  });

  it('falls back to the task assignee when approval actor is omitted', async () => {
    await service.approve(taskId, organizationId);

    expect(
      taskFeedbackMemoryAdapter.captureFromTaskReview,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'approved',
        userId: assigneeUserId,
      }),
    );
  });

  it('omits feedback memory user id when optional actor and assignee are missing', async () => {
    delete currentTask.assigneeUserId;

    await service.approve(taskId, organizationId);
    await service.keepOutput(taskId, outputId, organizationId);
    await service.trashOutput(taskId, outputId, organizationId);

    const captureInputs =
      taskFeedbackMemoryAdapter.captureFromTaskReview.mock.calls.map(
        ([input]) => input,
      );

    expect(captureInputs).toHaveLength(3);
    for (const input of captureInputs) {
      expect(input).not.toHaveProperty('userId');
    }
  });
});
