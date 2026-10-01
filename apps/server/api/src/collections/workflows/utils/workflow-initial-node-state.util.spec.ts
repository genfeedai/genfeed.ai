import type { WorkflowExecutionProgressService } from '@api/collections/workflows/services/workflow-execution-progress.service';
import { WorkflowNodeProgressTrackerService } from '@api/collections/workflows/services/workflow-node-progress-tracker.service';
import {
  createInitialWorkflowNodeState,
  findInitialWorkflowTriggerNode,
  prepopulateInitialWorkflowLockedNodes,
} from '@api/collections/workflows/utils/workflow-initial-node-state.util';
import type {
  ExecutableNode,
  ExecutableWorkflow,
} from '@genfeedai/workflows/engine';
import { planPartialExecution } from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

function node(
  id: string,
  type: string,
  cachedOutput?: unknown,
  isLocked = true,
): ExecutableNode {
  return {
    id,
    type,
    cachedOutput,
    isLocked,
    config: {},
    inputs: [],
    label: id,
  };
}
function graph(
  nodes: ExecutableNode[],
  lockedNodeIds = nodes.map((n) => n.id),
): ExecutableWorkflow {
  return {
    id: 'workflow',
    versionId: 'version',
    organizationId: 'org',
    userId: 'actor',
    emitSharedEvents: false,
    nodes,
    edges: [],
    lockedNodeIds,
  };
}
const trigger = { type: 'manual', data: { prompt: 'original' } };

describe('shared fresh workflow initial node state', () => {
  it('maps trigger aliases to the first matching node and preserves unknown event types', () => {
    const workflow = graph([
      node('first', 'commentTrigger'),
      node('second', 'commentTrigger'),
      node('manual', 'manual'),
    ]);
    expect(findInitialWorkflowTriggerNode(workflow, 'comment')?.id).toBe(
      'first',
    );
    expect(findInitialWorkflowTriggerNode(workflow, 'commentTrigger')?.id).toBe(
      'first',
    );
    expect(findInitialWorkflowTriggerNode(workflow, 'manual')?.id).toBe(
      'manual',
    );
    expect(findInitialWorkflowTriggerNode(workflow, 'missing')).toBeUndefined();
  });
  it('requires all existing lock conditions without treating null, false or zero as missing', () => {
    const workflow = graph(
      [
        node('zero', 'imageGen', 0),
        node('null', 'imageGen', null),
        node('false', 'imageGen', false),
        node('undefined', 'imageGen'),
        node('unlocked', 'imageGen', 'ignored', false),
        node('unlisted', 'imageGen', 'ignored'),
      ],
      ['zero', 'null', 'false', 'undefined', 'unlocked'],
    );
    const state = createInitialWorkflowNodeState(workflow, trigger);
    expect(Object.fromEntries(state.nodeCache)).toEqual({
      zero: 0,
      null: null,
      false: false,
    });
    expect([...state.completedNodes]).toEqual(['zero', 'null', 'false']);
  });
  it('full respectLocks=false keeps locked workflow inputs but reruns ordinary locked nodes', () => {
    const workflow = graph([
      node('input', 'workflowInput', 'input-value'),
      node('output', 'imageGen', 'old-output'),
    ]);
    expect(
      Object.fromEntries(
        createInitialWorkflowNodeState(workflow, trigger, {
          respectLocks: false,
        }).nodeCache,
      ),
    ).toEqual({ input: 'input-value' });
  });
  it('partial respectLocks=false reruns selected locks and preserves unselected dependency values', () => {
    const workflow = graph([
      node('input', 'workflowInput', 'value'),
      node('upstream', 'imageGen', 'previous-image'),
      node('selected', 'videoGen', 'previous-video'),
    ]);
    workflow.edges = [
      { id: 'source', source: 'upstream', target: 'selected' },
      { id: 'input', source: 'input', target: 'selected' },
    ];
    const state = createInitialWorkflowNodeState(workflow, trigger, {
      respectLocks: false,
      selectedNodeIds: ['selected'],
    });
    expect(Object.fromEntries(state.nodeCache)).toEqual({
      input: 'value',
      upstream: 'previous-image',
    });
    const plan = planPartialExecution(
      ['selected'],
      workflow.nodes,
      workflow.edges,
      state.nodeCache,
    );
    expect(plan.isValid).toBe(true);
    expect(plan.executionOrder).toEqual(['selected']);
    expect(plan.nodesRequiringCache).toEqual(
      expect.arrayContaining(['input', 'upstream']),
    );
  });
  it('respectLocks=true includes selected locks, preserving the existing runner semantics', () => {
    const workflow = graph([node('selected', 'videoGen', 'existing')]);
    expect(
      Object.fromEntries(
        createInitialWorkflowNodeState(workflow, trigger, {
          respectLocks: true,
          selectedNodeIds: ['selected'],
        }).nodeCache,
      ),
    ).toEqual({ selected: 'existing' });
  });
  it('preserves the explicit empty selection array distinction from absent selection', () => {
    const workflow = graph([node('ordinary', 'imageGen', 'existing')]);
    expect(
      Object.fromEntries(
        createInitialWorkflowNodeState(workflow, trigger, {
          respectLocks: false,
          selectedNodeIds: [],
        }).nodeCache,
      ),
    ).toEqual({ ordinary: 'existing' });
    expect(
      createInitialWorkflowNodeState(workflow, trigger, { respectLocks: false })
        .nodeCache.size,
    ).toBe(0);
  });
  it('populates trigger first then locked values, exactly matching existing initialization order', () => {
    const workflow = graph([node('manual', 'manual', { old: true })]);
    const state = createInitialWorkflowNodeState(workflow, trigger);
    expect(state.nodeCache.get('manual')).toEqual({ old: true });
    const unlocked = createInitialWorkflowNodeState(workflow, trigger, {
      respectLocks: false,
    });
    expect(unlocked.nodeCache.get('manual')).toEqual(trigger.data);
  });
  it('fresh initialization has no queue or prior execution cache, keeps graph unchanged and creates fresh containers', () => {
    const workflow = graph([node('uncached', 'imageGen')]);
    const before = structuredClone(workflow);
    const first = createInitialWorkflowNodeState(workflow, trigger);
    first.nodeCache.set('queue-only', 'not-authoritative');
    first.completedNodes.add('queue-only');
    const second = createInitialWorkflowNodeState(workflow, trigger);
    expect(second.nodeCache.size).toBe(0);
    expect(second.completedNodes.size).toBe(0);
    expect(workflow).toEqual(before);
  });
  it('shared runner helper preserves existing completed cache entries and replaces only eligible locks', () => {
    const workflow = graph([node('locked', 'imageGen', 'frozen-value')]);
    const cache = new Map<string, unknown>([
      ['completed', 'provider-value'],
      ['locked', 'older-cache'],
    ]);
    const completed = new Set(['completed']);
    prepopulateInitialWorkflowLockedNodes(workflow, cache, completed);
    expect(Object.fromEntries(cache)).toEqual({
      completed: 'provider-value',
      locked: 'frozen-value',
    });
    expect([...completed]).toEqual(['completed', 'locked']);
  });
  it('the existing progress tracker uses the same trigger match and still persists exactly one trigger result', async () => {
    const workflow = graph([
      node('first', 'commentTrigger'),
      node('second', 'commentTrigger'),
    ]);
    const progress = {
      trackNodeResult: vi.fn(async () => ({ progress: 0 })),
      updateExecutionEta: vi.fn(),
    };
    const tracker = new WorkflowNodeProgressTrackerService(
      progress as unknown as WorkflowExecutionProgressService,
    );
    const event = {
      type: 'comment',
      platform: 'internal',
      data: { comment: 'original' },
      organizationId: 'org',
      userId: 'actor',
    };
    const cache = new Map<string, unknown>();
    const completed = new Set<string>();
    await tracker.injectTriggerNode({
      workflow,
      triggerEvent: event,
      executionId: 'execution',
      nodeCache: cache,
      completedNodes: completed,
      nodeResults: new Map(),
      skippedNodes: new Set(),
      startedAt: new Date(),
      options: { workflowLabel: 'Workflow' },
    });
    expect(cache.get('first')).toEqual(event.data);
    expect(cache.has('second')).toBe(false);
    expect([...completed]).toEqual(['first']);
    expect(progress.trackNodeResult).toHaveBeenCalledTimes(1);
    expect(progress.trackNodeResult.mock.calls[0]?.slice(0, 3)).toEqual([
      'execution',
      'first',
      'commentTrigger',
    ]);
    expect(progress.updateExecutionEta).toHaveBeenCalledTimes(1);
  });
});
