import { beforeEach, describe, expect, it } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import type { ExecutorInput } from '../base-executor';
import {
  PostPublishTriggerExecutor,
  type PostPublishTriggerOutput,
} from './post-publish-trigger-executor';

function makeInput(
  config: Record<string, unknown>,
  injected?: Record<string, unknown>,
): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'pp-1',
    inputs: [],
    label: 'On Publish',
    type: 'postPublishTrigger',
  };
  const inputs = new Map<string, unknown>();
  if (injected !== undefined) {
    inputs.set('event', injected);
  }
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs, node };
}

describe('PostPublishTriggerExecutor', () => {
  let executor: PostPublishTriggerExecutor;

  beforeEach(() => {
    executor = new PostPublishTriggerExecutor();
  });

  it('normalizes injected publish event data', async () => {
    const result = await executor.execute(
      makeInput(
        {},
        {
          brandId: 'brand-1',
          caption: 'Launch day!',
          platforms: ['twitter', 'linkedin'],
          postIds: ['p1', 'p2'],
          status: 'queued',
          targetKeyword: 'launch',
        },
      ),
    );
    const data = result.data as PostPublishTriggerOutput;
    expect(data.postIds).toEqual(['p1', 'p2']);
    expect(data.platforms).toEqual(['twitter', 'linkedin']);
    expect(data.content).toBe('Launch day!');
    expect(data.targetKeyword).toBe('launch');
    expect(data.brandId).toBe('brand-1');
    expect(result.metadata?.postCount).toBe(2);
    expect(result.metadata?.platformCount).toBe(2);
  });

  it('defaults to safe empty values when no event data is present', async () => {
    const result = await executor.execute(makeInput({}));
    const data = result.data as PostPublishTriggerOutput;
    expect(data.postIds).toEqual([]);
    expect(data.platforms).toEqual([]);
    expect(data.content).toBeNull();
    expect(data.targetKeyword).toBeNull();
  });

  it('is a free node', () => {
    const node: ExecutableNode = {
      config: {},
      id: 'pp',
      inputs: [],
      label: 'On Publish',
      type: 'postPublishTrigger',
    };
    expect(executor.estimateCost(node)).toBe(0);
  });
});
