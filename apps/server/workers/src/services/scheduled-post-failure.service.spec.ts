import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { RecordActivityInput } from '@api/services/activity-recording/activity-recording.types';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { ScheduledPostFailureService } from '@workers/services/scheduled-post-failure.service';
import type { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

interface ChildTarget {
  error?: { code: string };
  groupId?: string;
  organizationId?: string;
  reason?: string;
  state: TargetExecutionState;
}

function createHarness() {
  const state = {
    activities: [] as RecordActivityInput[],
    errors: [] as Array<{ context: Record<string, unknown>; message: string }>,
    // Children by id. A transition only applies from one of the allowed prior
    // states, as the guarded update does in the database.
    children: new Map<string, ChildTarget>(),
    isActivityStoreDown: false,
    unreachableChildren: new Set<string>(),
  };
  const service = new ScheduledPostFailureService(
    {
      error: (message: string, context: Record<string, unknown>) => {
        state.errors.push({ context, message });
      },
      log: () => {},
      warn: () => {},
    } as unknown as LoggerService,
    {
      record: async (activity: RecordActivityInput) => {
        if (state.isActivityStoreDown) {
          throw new Error('activity store unavailable');
        }
        state.activities.push(activity);
      },
    } as unknown as ActivityRecorderService,
    {
      transitionPost: async (
        target: { groupId?: string; id: string; organizationId: string },
        update: {
          error: { code: string };
          executionState: TargetExecutionState;
        },
        reason: string,
        guard: { priorExecutionStates: TargetExecutionState[] },
      ) => {
        if (state.unreachableChildren.has(target.id)) {
          throw new Error('transition failed');
        }
        const child = state.children.get(target.id);
        if (!child || !guard.priorExecutionStates.includes(child.state)) {
          return false;
        }
        state.children.set(target.id, {
          error: update.error,
          groupId: target.groupId,
          organizationId: target.organizationId,
          reason,
          state: update.executionState,
        });
        return true;
      },
    } as unknown as SchedulerPublishStateService,
  );
  return { service, state };
}

function parent(children: Array<{ groupId?: string; id: string }>): PostEntity {
  return {
    children,
    id: { toString: () => 'post-1' },
    organizationId: 'org-1',
  } as unknown as PostEntity;
}

describe('ScheduledPostFailureService', () => {
  describe('notifyPublishFailed', () => {
    it('records the owner-facing failure activity', async () => {
      const { service, state } = createHarness();
      const activity = { key: 'POST_FAILED' } as unknown as RecordActivityInput;

      await service.notifyPublishFailed(parent([]), activity);

      expect(state.activities).toEqual([activity]);
    });

    it('logs instead of throwing when recording the activity fails', async () => {
      const { service, state } = createHarness();
      state.isActivityStoreDown = true;

      await expect(
        service.notifyPublishFailed(
          parent([]),
          {} as unknown as RecordActivityInput,
        ),
      ).resolves.toBeUndefined();

      expect(state.errors).toEqual([
        {
          context: { error: 'activity store unavailable', postId: 'post-1' },
          message: expect.stringContaining(
            'failed to record publish failure activity',
          ),
        },
      ]);
    });
  });

  describe('failChildren', () => {
    it('fails each pending child with the given code and reason', async () => {
      const { service, state } = createHarness();
      state.children.set('child-1', { state: TargetExecutionState.SCHEDULED });
      state.children.set('child-2', { state: TargetExecutionState.PUBLISHING });

      await service.failChildren(
        parent([{ groupId: 'group-1', id: 'child-1' }, { id: 'child-2' }]),
        'parent_failed',
        'Parent post failed',
      );

      expect(state.children.get('child-1')).toEqual({
        error: expect.objectContaining({ code: 'parent_failed' }),
        groupId: 'group-1',
        organizationId: 'org-1',
        reason: 'Parent post failed',
        state: TargetExecutionState.FAILED,
      });
      expect(state.children.get('child-2')?.state).toBe(
        TargetExecutionState.FAILED,
      );
    });

    it('leaves a child the provider already delivered untouched', async () => {
      const { service, state } = createHarness();
      state.children.set('child-1', { state: TargetExecutionState.PUBLISHED });

      await service.failChildren(
        parent([{ id: 'child-1' }]),
        'parent_failed',
        'reason',
      );

      expect(state.children.get('child-1')).toEqual({
        state: TargetExecutionState.PUBLISHED,
      });
    });

    it('logs and continues when a child transition throws', async () => {
      const { service, state } = createHarness();
      state.unreachableChildren.add('child-1');
      state.children.set('child-1', { state: TargetExecutionState.SCHEDULED });
      state.children.set('child-2', { state: TargetExecutionState.SCHEDULED });

      await service.failChildren(
        parent([{ id: 'child-1' }, { id: 'child-2' }]),
        'parent_failed',
        'reason',
      );

      expect(state.children.get('child-2')?.state).toBe(
        TargetExecutionState.FAILED,
      );
      expect(state.errors).toEqual([
        {
          context: {
            childPostId: 'child-1',
            error: 'transition failed',
            parentPostId: 'post-1',
          },
          message: expect.stringContaining('failed to mark child as failed'),
        },
      ]);
    });
  });
});
