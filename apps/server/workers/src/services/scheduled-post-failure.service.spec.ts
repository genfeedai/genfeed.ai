import { TargetExecutionState } from '@genfeedai/contracts';
import { ScheduledPostFailureService } from '@workers/services/scheduled-post-failure.service';

function createHarness() {
  const activitiesService = { create: vi.fn().mockResolvedValue(undefined) };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const schedulerPublishStateService = {
    transitionPost: vi.fn().mockResolvedValue(true),
  };
  const service = new ScheduledPostFailureService(
    logger as never,
    activitiesService as never,
    schedulerPublishStateService as never,
  );

  return { activitiesService, logger, schedulerPublishStateService, service };
}

describe('ScheduledPostFailureService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('notifyPublishFailed', () => {
    it('records the owner-facing failure activity', async () => {
      const { activitiesService, service } = createHarness();
      const post = { id: { toString: () => 'post-1' } };
      const activity = { key: 'POST_FAILED' };

      await service.notifyPublishFailed(post as never, activity as never);

      expect(activitiesService.create).toHaveBeenCalledWith(activity);
    });

    it('logs instead of throwing when recording the activity fails', async () => {
      const { activitiesService, logger, service } = createHarness();
      activitiesService.create.mockRejectedValue(
        new Error('activity store unavailable'),
      );
      const post = { id: { toString: () => 'post-1' } };

      await expect(
        service.notifyPublishFailed(post as never, {} as never),
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to record publish failure activity'),
        expect.objectContaining({
          error: 'activity store unavailable',
          postId: 'post-1',
        }),
      );
    });
  });

  describe('failChildren', () => {
    it('does nothing when the parent has no children', async () => {
      const { schedulerPublishStateService, service } = createHarness();
      const post = { children: [], id: { toString: () => 'post-1' } };

      await service.failChildren(post as never, 'parent_failed', 'reason');

      expect(
        schedulerPublishStateService.transitionPost,
      ).not.toHaveBeenCalled();
    });

    it('transitions each pending child to FAILED with the given code and reason', async () => {
      const { schedulerPublishStateService, service } = createHarness();
      const post = {
        children: [{ groupId: 'group-1', id: 'child-1' }],
        id: { toString: () => 'post-1' },
        organizationId: 'org-1',
      };

      await service.failChildren(
        post as never,
        'parent_failed',
        'Parent post failed',
      );

      expect(schedulerPublishStateService.transitionPost).toHaveBeenCalledWith(
        { groupId: 'group-1', id: 'child-1', organizationId: 'org-1' },
        expect.objectContaining({
          error: expect.objectContaining({ code: 'parent_failed' }),
          executionState: TargetExecutionState.FAILED,
        }),
        'Parent post failed',
        {
          priorExecutionStates: [
            TargetExecutionState.SCHEDULED,
            TargetExecutionState.PUBLISHING,
          ],
        },
      );
    });

    it('logs and continues when a child transition throws', async () => {
      const { logger, schedulerPublishStateService, service } = createHarness();
      schedulerPublishStateService.transitionPost.mockRejectedValueOnce(
        new Error('transition failed'),
      );
      const post = {
        children: [{ id: 'child-1' }, { id: 'child-2' }],
        id: { toString: () => 'post-1' },
        organizationId: 'org-1',
      };

      await service.failChildren(post as never, 'parent_failed', 'reason');

      expect(schedulerPublishStateService.transitionPost).toHaveBeenCalledTimes(
        2,
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to mark child as failed'),
        expect.objectContaining({
          childPostId: 'child-1',
          error: 'transition failed',
          parentPostId: 'post-1',
        }),
      );
    });
  });
});
