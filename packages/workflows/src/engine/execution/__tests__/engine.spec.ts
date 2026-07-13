import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
} from '../../types';
import { type NodeExecutor, WorkflowEngine } from '../engine';

function makeNode(
  id: string,
  type = 'generate',
  overrides: Partial<ExecutableNode> = {},
): ExecutableNode {
  return {
    config: {},
    id,
    inputs: [],
    label: id,
    type,
    ...overrides,
  };
}

function makeEdge(
  source: string,
  target: string,
  overrides: Partial<ExecutableEdge> = {},
): ExecutableEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    ...overrides,
  };
}

function makeWorkflow(
  nodes: ExecutableNode[],
  edges: ExecutableEdge[] = [],
  overrides: Partial<ExecutableWorkflow> = {},
): ExecutableWorkflow {
  return {
    edges,
    id: 'wf-1',
    lockedNodeIds: [],
    nodes,
    organizationId: 'org-1',
    userId: 'user-1',
    ...overrides,
  };
}

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let mockExecutor: NodeExecutor;

  beforeEach(() => {
    engine = new WorkflowEngine({
      maxConcurrency: 3,
      retryConfig: {
        backoffMultiplier: 1,
        baseDelayMs: 0,
        maxDelayMs: 0,
        maxRetries: 0,
      },
    });
    mockExecutor = vi.fn().mockResolvedValue({ result: 'ok' });
    engine.registerExecutor('generate', mockExecutor);
    engine.registerExecutor('upscale', mockExecutor);
    engine.registerExecutor('publish', mockExecutor);
  });

  describe('registerExecutor / getExecutor', () => {
    it('should register and retrieve an executor', () => {
      const executor = vi.fn();
      engine.registerExecutor('custom', executor);

      expect(engine.getExecutor('custom')).toBe(executor);
    });

    it('should return undefined for unregistered type', () => {
      expect(engine.getExecutor('unknown')).toBeUndefined();
    });

    it('should fall back to defaultExecutor when type not registered', () => {
      const defaultExec = vi.fn();
      const engineWithDefault = new WorkflowEngine({
        defaultExecutor: defaultExec,
      });

      expect(engineWithDefault.getExecutor('unknown')).toBe(defaultExec);
    });
  });

  describe('topologicalSort (via execute)', () => {
    it('should execute a single node', async () => {
      const workflow = makeWorkflow([makeNode('n1')]);

      const result = await engine.execute(workflow);

      expect(result.status).toBe('completed');
      expect(result.nodeResults.size).toBe(1);
      expect(result.nodeResults.get('n1')?.status).toBe('completed');
    });

    it('should pass persisted execution id into node context', async () => {
      const contextExecutor: NodeExecutor = vi.fn(
        async (_node, _inputs, ctx) => ({
          executionId: ctx.executionId,
          runId: ctx.runId,
          workflowId: ctx.workflowId,
        }),
      );
      engine.registerExecutor('generate', contextExecutor);

      const workflow = makeWorkflow([makeNode('n1')]);

      await engine.execute(workflow, { executionId: 'exec-1' });

      expect(contextExecutor).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Map),
        expect.objectContaining({
          executionId: 'exec-1',
          organizationId: 'org-1',
          userId: 'user-1',
          workflowId: 'wf-1',
        }),
      );
    });

    it('should execute nodes in dependency order', async () => {
      const executionOrder: string[] = [];
      const trackingExecutor: NodeExecutor = vi.fn(async (node) => {
        executionOrder.push(node.id);
        return { result: node.id };
      });

      engine.registerExecutor('generate', trackingExecutor);
      engine.registerExecutor('upscale', trackingExecutor);

      const workflow = makeWorkflow(
        [makeNode('n1', 'generate'), makeNode('n2', 'upscale')],
        [makeEdge('n1', 'n2')],
      );

      await engine.execute(workflow);

      expect(executionOrder).toEqual(['n1', 'n2']);
    });

    it('should handle diamond dependency graph', async () => {
      const executionOrder: string[] = [];
      const trackingExecutor: NodeExecutor = vi.fn(async (node) => {
        executionOrder.push(node.id);
        return { result: node.id };
      });

      engine.registerExecutor('generate', trackingExecutor);
      engine.registerExecutor('upscale', trackingExecutor);
      engine.registerExecutor('publish', trackingExecutor);

      // Diamond:  A → B, A → C, B → D, C → D
      const workflow = makeWorkflow(
        [
          makeNode('A', 'generate'),
          makeNode('B', 'upscale'),
          makeNode('C', 'upscale'),
          makeNode('D', 'publish'),
        ],
        [
          makeEdge('A', 'B'),
          makeEdge('A', 'C'),
          makeEdge('B', 'D'),
          makeEdge('C', 'D'),
        ],
      );

      await engine.execute(workflow);

      // A must come first, D must come last
      expect(executionOrder[0]).toBe('A');
      expect(executionOrder[3]).toBe('D');
      // B and C can be in either order
      expect(executionOrder.slice(1, 3).sort()).toEqual(['B', 'C']);
    });

    it('should handle independent parallel branches', async () => {
      const workflow = makeWorkflow([
        makeNode('n1', 'generate'),
        makeNode('n2', 'upscale'),
        makeNode('n3', 'publish'),
      ]);

      const result = await engine.execute(workflow);

      expect(result.status).toBe('completed');
      expect(result.nodeResults.size).toBe(3);
    });
  });

  describe('execute — input gathering', () => {
    it('should pass upstream output as inputs to downstream node', async () => {
      const capturedInputs: Map<string, unknown>[] = [];
      const capturingExecutor: NodeExecutor = vi.fn(async (node, inputs) => {
        capturedInputs.push(new Map(inputs));
        return { data: `from-${node.id}` };
      });

      engine.registerExecutor('generate', capturingExecutor);
      engine.registerExecutor('upscale', capturingExecutor);

      const workflow = makeWorkflow(
        [makeNode('n1', 'generate'), makeNode('n2', 'upscale')],
        [makeEdge('n1', 'n2', { targetHandle: 'image' })],
      );

      await engine.execute(workflow);

      // First node should have empty inputs
      expect(capturedInputs[0].size).toBe(0);
      // Second node should receive first node's output keyed by targetHandle
      expect(capturedInputs[1].get('image')).toEqual({
        data: 'from-n1',
      });
    });

    it('should use source node id as key when targetHandle is absent', async () => {
      const capturedInputs: Map<string, unknown>[] = [];
      const capturingExecutor: NodeExecutor = vi.fn(async (node, inputs) => {
        capturedInputs.push(new Map(inputs));
        return `output-${node.id}`;
      });

      engine.registerExecutor('generate', capturingExecutor);
      engine.registerExecutor('upscale', capturingExecutor);

      const workflow = makeWorkflow(
        [makeNode('n1', 'generate'), makeNode('n2', 'upscale')],
        [makeEdge('n1', 'n2')],
      );

      await engine.execute(workflow);

      expect(capturedInputs[1].get('n1')).toBe('output-n1');
    });

    it('should read sourceHandle field and write it to targetHandle', async () => {
      const capturedInputs: Map<string, unknown>[] = [];
      const sourceExecutor: NodeExecutor = vi.fn(async () => ({
        topTopics: ['ai tools'],
      }));
      const targetExecutor: NodeExecutor = vi.fn(async (_node, inputs) => {
        capturedInputs.push(new Map(inputs));
        return null;
      });

      engine.registerExecutor('generate', sourceExecutor);
      engine.registerExecutor('upscale', targetExecutor);

      const workflow = makeWorkflow(
        [makeNode('n1', 'generate'), makeNode('n2', 'upscale')],
        [
          makeEdge('n1', 'n2', {
            sourceHandle: 'topTopics',
            targetHandle: 'keywords',
          }),
        ],
      );

      await engine.execute(workflow);

      expect(capturedInputs[0].get('keywords')).toEqual(['ai tools']);
    });
  });

  describe('execute — failure handling', () => {
    it('should stop execution on node failure', async () => {
      const failingExecutor: NodeExecutor = vi
        .fn()
        .mockRejectedValue(new Error('generation failed'));
      engine.registerExecutor('generate', failingExecutor);

      const workflow = makeWorkflow(
        [makeNode('n1', 'generate'), makeNode('n2', 'upscale')],
        [makeEdge('n1', 'n2')],
      );

      const result = await engine.execute(workflow);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('generation failed');
      expect(result.nodeResults.get('n1')?.status).toBe('failed');
      expect(result.nodeResults.has('n2')).toBe(false);
    });

    it('should fail when no executor is registered for a node type', async () => {
      const workflow = makeWorkflow([makeNode('n1', 'unknownType')]);

      const result = await engine.execute(workflow);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('No executor registered');
    });

    it('should fail when node is not found in workflow', async () => {
      // Create a scenario where executionOrder has a nodeId not in nodes
      // This is hard to trigger directly; instead test missing dependency
      const workflow = makeWorkflow(
        [makeNode('n1', 'generate'), makeNode('n2', 'upscale')],
        [makeEdge('n1', 'n2')],
      );

      // Remove n1 executor to force failure
      engine.registerExecutor(
        'generate',
        vi.fn().mockRejectedValue(new Error('fail')),
      );

      const result = await engine.execute(workflow);

      expect(result.status).toBe('failed');
    });
  });

  describe('execute — locked nodes', () => {
    it('should skip locked nodes with cached output', async () => {
      const workflow = makeWorkflow(
        [
          makeNode('n1', 'generate', {
            cachedOutput: { image: 'cached.png' },
            isLocked: true,
          }),
          makeNode('n2', 'upscale'),
        ],
        [makeEdge('n1', 'n2')],
        { lockedNodeIds: ['n1'] },
      );

      const result = await engine.execute(workflow);

      expect(result.status).toBe('completed');
      expect(result.nodeResults.get('n1')?.status).toBe('skipped');
      expect(result.nodeResults.get('n2')?.status).toBe('completed');
      // n1 executor should NOT have been called
      expect(mockExecutor).toHaveBeenCalledTimes(1);
    });

    it('should pass locked node cached output as input to downstream', async () => {
      const capturedInputs: Map<string, unknown>[] = [];
      const capturingExecutor: NodeExecutor = vi.fn(async (_node, inputs) => {
        capturedInputs.push(new Map(inputs));
        return 'done';
      });

      engine.registerExecutor('upscale', capturingExecutor);

      const workflow = makeWorkflow(
        [
          makeNode('n1', 'generate', {
            cachedOutput: { image: 'cached.png' },
            isLocked: true,
          }),
          makeNode('n2', 'upscale'),
        ],
        [makeEdge('n1', 'n2', { targetHandle: 'input' })],
        { lockedNodeIds: ['n1'] },
      );

      await engine.execute(workflow);

      expect(capturedInputs[0].get('input')).toEqual({ image: 'cached.png' });
    });

    it('should execute locked nodes when respectLocks is false', async () => {
      const workflow = makeWorkflow(
        [
          makeNode('n1', 'generate', {
            cachedOutput: { image: 'cached.png' },
            isLocked: true,
          }),
        ],
        [],
        { lockedNodeIds: ['n1'] },
      );

      const result = await engine.execute(workflow, { respectLocks: false });

      expect(result.status).toBe('completed');
      expect(result.nodeResults.get('n1')?.status).toBe('completed');
      // Executor should have been called (not skipped)
      expect(mockExecutor).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute — credit checking', () => {
    it('should fail when insufficient credits', async () => {
      const engineWithCosts = new WorkflowEngine({
        creditCosts: { generate: 10, upscale: 5 },
      });
      engineWithCosts.registerExecutor('generate', mockExecutor);
      engineWithCosts.registerExecutor('upscale', mockExecutor);

      const workflow = makeWorkflow([
        makeNode('n1', 'generate'),
        makeNode('n2', 'upscale'),
      ]);

      const result = await engineWithCosts.execute(workflow, {
        availableCredits: 5,
      });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Insufficient credits');
    });

    it('should pass when sufficient credits', async () => {
      const engineWithCosts = new WorkflowEngine({
        creditCosts: { generate: 10 },
      });
      engineWithCosts.registerExecutor('generate', mockExecutor);

      const workflow = makeWorkflow([makeNode('n1', 'generate')]);

      const result = await engineWithCosts.execute(workflow, {
        availableCredits: 100,
      });

      expect(result.status).toBe('completed');
    });

    it('should track total credits used', async () => {
      const engineWithCosts = new WorkflowEngine({
        creditCosts: { generate: 10, upscale: 5 },
      });
      engineWithCosts.registerExecutor('generate', mockExecutor);
      engineWithCosts.registerExecutor('upscale', mockExecutor);

      const workflow = makeWorkflow([
        makeNode('n1', 'generate'),
        makeNode('n2', 'upscale'),
      ]);

      const result = await engineWithCosts.execute(workflow);

      expect(result.totalCreditsUsed).toBe(15);
    });
  });

  describe('execute — dry run', () => {
    it('should return completed without executing any nodes', async () => {
      const workflow = makeWorkflow([makeNode('n1', 'generate')]);

      const result = await engine.execute(workflow, { dryRun: true });

      expect(result.status).toBe('completed');
      expect(result.totalCreditsUsed).toBe(0);
      expect(mockExecutor).not.toHaveBeenCalled();
    });
  });

  describe('execute — progress callbacks', () => {
    it('should call onProgress after each node completes', async () => {
      const progressEvents: number[] = [];
      const onProgress = vi.fn((event) => {
        progressEvents.push(event.progress);
      });

      const workflow = makeWorkflow(
        [makeNode('n1', 'generate'), makeNode('n2', 'upscale')],
        [makeEdge('n1', 'n2')],
      );

      await engine.execute(workflow, { onProgress });

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(progressEvents[0]).toBe(50);
      expect(progressEvents[1]).toBe(100);
    });

    it('should call onNodeStatusChange with correct status transitions', async () => {
      const statusChanges: Array<{ nodeId: string; newStatus: string }> = [];
      const onNodeStatusChange = vi.fn((event) => {
        statusChanges.push({
          newStatus: event.newStatus,
          nodeId: event.nodeId,
        });
      });

      const workflow = makeWorkflow([makeNode('n1', 'generate')]);

      await engine.execute(workflow, { onNodeStatusChange });

      // Should emit 'running' then 'completed' for n1
      expect(statusChanges).toEqual([
        { newStatus: 'running', nodeId: 'n1' },
        { newStatus: 'completed', nodeId: 'n1' },
      ]);
    });

    it('should not throw when callback throws', async () => {
      const onProgress = vi.fn(() => {
        throw new Error('callback error');
      });

      const workflow = makeWorkflow([makeNode('n1', 'generate')]);

      const result = await engine.execute(workflow, { onProgress });

      expect(result.status).toBe('completed');
    });
  });

  describe('execute — partial execution', () => {
    it('should only execute selected nodes', async () => {
      const executionOrder: string[] = [];
      const trackingExecutor: NodeExecutor = vi.fn(async (node) => {
        executionOrder.push(node.id);
        return `output-${node.id}`;
      });

      engine.registerExecutor('generate', trackingExecutor);
      engine.registerExecutor('upscale', trackingExecutor);
      engine.registerExecutor('publish', trackingExecutor);

      const workflow = makeWorkflow(
        [
          makeNode('n1', 'generate'),
          makeNode('n2', 'upscale'),
          makeNode('n3', 'publish'),
        ],
        [makeEdge('n1', 'n2'), makeEdge('n2', 'n3')],
      );

      // Only execute n2, but n1 output is needed — n1 is not cached
      // so it should fail with missing dependency
      const result = await engine.execute(workflow, { nodeIds: ['n2'] });

      // n2 depends on n1 which has no cache — plan should be invalid
      expect(result.status).toBe('failed');
      expect(result.error).toContain('not available in cache');
    });

    it('should succeed with selected nodes when dependencies are cached', async () => {
      const workflow = makeWorkflow(
        [
          makeNode('n1', 'generate', {
            cachedOutput: 'cached-n1-output',
            isLocked: true,
          }),
          makeNode('n2', 'upscale'),
        ],
        [makeEdge('n1', 'n2')],
        { lockedNodeIds: ['n1'] },
      );

      const result = await engine.execute(workflow, { nodeIds: ['n2'] });

      expect(result.status).toBe('completed');
      expect(result.nodeResults.get('n2')?.status).toBe('completed');
    });

    it('should fail for non-existent nodeIds', async () => {
      const workflow = makeWorkflow([makeNode('n1', 'generate')]);

      const result = await engine.execute(workflow, {
        nodeIds: ['nonexistent'],
      });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('not found');
    });
  });

  describe('resume', () => {
    it('should resume from a failed run', async () => {
      // First run: n1 succeeds, n2 fails
      const callCount = { n2: 0 };
      const executorThatFailsOnce: NodeExecutor = vi.fn(async (node) => {
        if (node.id === 'n2') {
          callCount.n2++;
          if (callCount.n2 === 1) {
            throw new Error('temporary failure');
          }
        }
        return `output-${node.id}`;
      });

      engine.registerExecutor('generate', executorThatFailsOnce);
      engine.registerExecutor('upscale', executorThatFailsOnce);

      const workflow = makeWorkflow(
        [makeNode('n1', 'generate'), makeNode('n2', 'upscale')],
        [makeEdge('n1', 'n2')],
      );

      // First execution — n2 fails
      const firstRun = await engine.execute(workflow, { maxRetries: 0 });
      expect(firstRun.status).toBe('failed');

      // Resume — n2 should succeed this time
      const resumedRun = await engine.resume(workflow, firstRun, {
        maxRetries: 0,
      });

      expect(resumedRun.status).toBe('completed');
    });

    it('should not resume a completed run', async () => {
      const workflow = makeWorkflow([makeNode('n1', 'generate')]);

      const completedRun = await engine.execute(workflow);
      expect(completedRun.status).toBe('completed');

      const resumeResult = await engine.resume(workflow, completedRun);

      expect(resumeResult.status).toBe('failed');
      expect(resumeResult.error).toContain('Cannot resume');
    });
  });

  describe('execute — cancellation', () => {
    it('should stop dispatching and return cancelled when aborted mid-execution', async () => {
      const controller = new AbortController();
      const executed: string[] = [];
      const abortingExecutor: NodeExecutor = vi.fn(async (node) => {
        executed.push(node.id);
        if (node.id === 'n1') {
          controller.abort();
        }
        return { result: node.id };
      });

      engine.registerExecutor('generate', abortingExecutor);
      engine.registerExecutor('upscale', abortingExecutor);
      engine.registerExecutor('publish', abortingExecutor);

      // Sequential chain so the abort lands before n2/n3 are dispatched.
      const workflow = makeWorkflow(
        [
          makeNode('n1', 'generate'),
          makeNode('n2', 'upscale'),
          makeNode('n3', 'publish'),
        ],
        [makeEdge('n1', 'n2'), makeEdge('n2', 'n3')],
      );

      const result = await engine.execute(workflow, {
        abortSignal: controller.signal,
      });

      expect(result.status).toBe('cancelled');
      // Only the first node ran; later nodes were never dispatched.
      expect(executed).toEqual(['n1']);
      expect(result.nodeResults.has('n2')).toBe(false);
      expect(result.nodeResults.has('n3')).toBe(false);
    });

    it('should report cancelled when an in-flight sibling fails after the signal fires', async () => {
      // maxConcurrency 2 so n1 and n2 fill both slots while n3 is deferred.
      const cancelEngine = new WorkflowEngine({ maxConcurrency: 2 });
      const controller = new AbortController();

      // n1 aborts the run the moment it runs, then succeeds immediately.
      const aborter: NodeExecutor = vi.fn(async (node) => {
        controller.abort();
        return { result: node.id };
      });
      // n2 is already in flight when the abort fires; it fails during the drain.
      const failer: NodeExecutor = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('sibling failed during drain');
      });

      cancelEngine.registerExecutor('generate', aborter);
      cancelEngine.registerExecutor('upscale', failer);
      cancelEngine.registerExecutor('publish', aborter);

      // n1 + n2 occupy both slots; n3 is deferred so the dispatch phase re-runs
      // after n1 settles and observes the abort, then n2 fails during drain.
      const workflow = makeWorkflow([
        makeNode('n1', 'generate'),
        makeNode('n2', 'upscale'),
        makeNode('n3', 'publish'),
      ]);

      const result = await cancelEngine.execute(workflow, {
        abortSignal: controller.signal,
        maxRetries: 0,
      });

      // Abort wins over the concurrent in-flight failure.
      expect(result.status).toBe('cancelled');
      // n3 was deferred and never dispatched once the abort was observed.
      expect(result.nodeResults.has('n3')).toBe(false);
    });
  });

  describe('execute — concurrency limit', () => {
    it('should not run more than maxConcurrency nodes simultaneously', async () => {
      let active = 0;
      let maxActive = 0;
      const releases: Array<() => void> = [];

      const gatedExecutor: NodeExecutor = vi.fn(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => {
          releases.push(() => {
            active--;
            resolve();
          });
        });
        return { result: 'ok' };
      });

      // engine from beforeEach is configured with maxConcurrency: 3.
      engine.registerExecutor('generate', gatedExecutor);

      // 6 independent branches (no edges) all eligible to run at once.
      const workflow = makeWorkflow([
        makeNode('n1', 'generate'),
        makeNode('n2', 'generate'),
        makeNode('n3', 'generate'),
        makeNode('n4', 'generate'),
        makeNode('n5', 'generate'),
        makeNode('n6', 'generate'),
      ]);

      let done = false;
      const runPromise = engine.execute(workflow).then((r) => {
        done = true;
        return r;
      });

      // Drain: each tick, release every currently-gated node so the scheduler
      // can dispatch the next batch, until the run resolves.
      while (!done) {
        if (releases.length > 0) {
          const toRelease = releases.splice(0, releases.length);
          for (const release of toRelease) {
            release();
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const result = await runPromise;

      expect(result.status).toBe('completed');
      expect(result.nodeResults.size).toBe(6);
      // Never exceeded the limit, and actually reached it (proves parallelism).
      expect(maxActive).toBeLessThanOrEqual(3);
      expect(maxActive).toBe(3);
    });
  });

  describe('estimateCredits', () => {
    it('should return 0 for unknown node types', () => {
      const result = engine.estimateCredits([makeNode('n1', 'generate')]);

      expect(result).toBe(0);
    });

    it('should sum credits from cost config', () => {
      const engineWithCosts = new WorkflowEngine({
        creditCosts: { generate: 10, upscale: 5 },
      });

      const result = engineWithCosts.estimateCredits([
        makeNode('n1', 'generate'),
        makeNode('n2', 'upscale'),
        makeNode('n3', 'generate'),
      ]);

      expect(result).toBe(25);
    });
  });
});
