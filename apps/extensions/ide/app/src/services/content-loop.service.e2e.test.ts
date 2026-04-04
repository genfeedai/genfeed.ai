import { describe, expect, it } from 'bun:test';
import {
  type ContentLoopStep,
  executeContentLoop,
} from '@services/content-loop.service';
import type { RunActionType, RunRecord } from '@/types';

describe('content loop e2e flow', () => {
  it('runs create -> publish -> analytics in sequence', async () => {
    const executedActions: string[] = [];

    const runByAction: Partial<Record<RunActionType, RunRecord>> = {
      analytics: {
        _id: 'run-analytics',
        actionType: 'analytics',
        progress: 100,
        status: 'completed',
      },
      generate: {
        _id: 'run-generate',
        actionType: 'generate',
        progress: 100,
        status: 'completed',
      },
      post: {
        _id: 'run-post',
        actionType: 'post',
        progress: 100,
        status: 'completed',
      },
    };

    const steps: ContentLoopStep[] = [
      {
        actionType: 'generate',
        id: 'create',
        input: { prompt: 'Launch week hook set' },
      },
      {
        actionType: 'post',
        haltOnRejection: true,
        id: 'publish',
        input: { payload: 'draft_123' },
        requireConfirmation: true,
      },
      {
        actionType: 'analytics',
        id: 'analytics',
        input: { query: 'launch week performance summary' },
      },
    ];

    const result = await executeContentLoop({
      confirmStep: (step) => Promise.resolve(step.id !== 'reject-never-hit'),
      executeRun: (actionType) => {
        executedActions.push(actionType);
        const run = runByAction[actionType];
        if (!run) {
          return Promise.reject(
            new Error(`Missing run fixture for ${actionType}`),
          );
        }
        return Promise.resolve(run);
      },
      steps,
    });

    expect(executedActions).toEqual(['generate', 'post', 'analytics']);
    expect(result.runs).toHaveLength(3);
    expect(result.runs.map((run) => run._id)).toEqual([
      'run-generate',
      'run-post',
      'run-analytics',
    ]);
    expect(result.skippedSteps).toHaveLength(0);
    expect(result.abortedAt).toBeUndefined();
  });
});
