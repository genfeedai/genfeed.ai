import { describe, expect, it } from 'bun:test';
import {
  type ContentLoopStep,
  executeContentLoop,
} from '@services/content-loop.service';
import type { RunRecord } from '@/types';

describe('executeContentLoop', () => {
  it('aborts when a required confirmation is rejected with haltOnRejection', async () => {
    const executedActions: string[] = [];
    const steps: ContentLoopStep[] = [
      {
        actionType: 'generate',
        id: 'create',
        input: { prompt: 'Generate copy' },
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
        id: 'analyze',
        input: { query: 'campaign summary' },
      },
    ];

    const runTemplate: RunRecord = {
      _id: 'run-generate',
      actionType: 'generate',
      progress: 100,
      status: 'completed',
    };

    const result = await executeContentLoop({
      confirmStep: (step) => Promise.resolve(step.id !== 'publish'),
      executeRun: (actionType) => {
        executedActions.push(actionType);
        return Promise.resolve({
          ...runTemplate,
          _id: `run-${actionType}`,
          actionType,
        });
      },
      steps,
    });

    expect(executedActions).toEqual(['generate']);
    expect(result.abortedAt).toBe('publish');
    expect(result.skippedSteps).toEqual(['publish']);
    expect(result.runs.map((run) => run._id)).toEqual(['run-generate']);
  });

  it('skips rejected confirmation without abort when haltOnRejection is false', async () => {
    const executedActions: string[] = [];
    const steps: ContentLoopStep[] = [
      {
        actionType: 'generate',
        id: 'create',
        input: { prompt: 'Generate copy' },
      },
      {
        actionType: 'post',
        id: 'publish',
        input: { payload: 'draft_123' },
        requireConfirmation: true,
      },
      {
        actionType: 'analytics',
        id: 'analyze',
        input: { query: 'campaign summary' },
      },
    ];

    const result = await executeContentLoop({
      confirmStep: (step) => Promise.resolve(step.id !== 'publish'),
      executeRun: (actionType) => {
        executedActions.push(actionType);
        return Promise.resolve({
          _id: `run-${actionType}`,
          actionType,
          progress: 100,
          status: 'completed',
        });
      },
      steps,
    });

    expect(executedActions).toEqual(['generate', 'analytics']);
    expect(result.abortedAt).toBeUndefined();
    expect(result.skippedSteps).toEqual(['publish']);
    expect(result.runs.map((run) => run.actionType)).toEqual([
      'generate',
      'analytics',
    ]);
  });

  it('forwards metadata into executeRun options', async () => {
    const metadata = { campaignId: 'cmp_123', source: 'ide.test' };
    const callOptions: Array<{ metadata?: Record<string, unknown> }> = [];
    const steps: ContentLoopStep[] = [
      {
        actionType: 'generate',
        id: 'create',
        input: { prompt: 'metadata check' },
        metadata,
      },
    ];

    await executeContentLoop({
      executeRun: (_actionType, _input, options) => {
        callOptions.push(options ?? {});
        return Promise.resolve({
          _id: 'run-generate',
          actionType: 'generate',
          progress: 100,
          status: 'completed',
        });
      },
      steps,
    });

    expect(callOptions).toHaveLength(1);
    expect(callOptions[0]?.metadata).toEqual(metadata);
  });
});
