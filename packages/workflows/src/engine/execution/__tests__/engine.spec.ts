import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ExecutableEdge,
  ExecutableNode,
  ExecutableWorkflow,
} from '../../types';
import { createExecutableActionNode } from '../../utils/action-node';
import { type NodeExecutor, WorkflowEngine } from '../engine';
import { PermanentExecutionError } from '../execution-error';

// Real @genfeedai/actions output contracts are closed schemas
// (`additionalProperties: false`), so mock executors must return
// fixtures that satisfy each action's declared required fields.
function buildFixtureOutput(actionId: string): unknown {
  switch (actionId) {
    case 'imageGen':
      return {
        id: 'media-1',
        model: 'flux',
        provider: 'replicate',
        status: 'succeeded',
      };
    case 'publish':
      return {
        platforms: [],
        postIds: [],
        scheduledFor: null,
        status: 'published',
      };
    case 'upscale':
      return {
        id: 'media-1',
        mediaUrl: 'https://cdn.example.com/media.png',
        model: 'esrgan',
        scale: '2x',
        status: 'succeeded',
      };
    case 'videoStitch':
      return {
        ingredientId: 'stitched',
        video: 'stitched.mp4',
        videoUrl: 'https://cdn.example.com/stitched.mp4',
      };
    default:
      throw new Error(`No fixture output registered for action "${actionId}"`);
  }
}

// Tests that need a bespoke executor for an action already registered in
// beforeEach's shared `engine` build their own engine here instead of
// re-registering — WorkflowEngine.registerExecutor throws on duplicates.
function createTestEngine(
  overrides: ConstructorParameters<typeof WorkflowEngine>[0] = {},
): WorkflowEngine {
  return new WorkflowEngine({
    maxConcurrency: 3,
    retryConfig: {
      backoffMultiplier: 1,
      baseDelayMs: 0,
      maxDelayMs: 0,
      maxRetries: 0,
    },
    ...overrides,
  });
}

function makeNode(
  id: string,
  type = 'publish',
  overrides: Partial<ExecutableNode> = {},
): ExecutableNode {
  if (['imageGen', 'publish', 'upscale', 'videoStitch'].includes(type)) {
    return {
      ...createExecutableActionNode({
        actionId: type,
        id,
        label: id,
        parameters: overrides.config ?? {},
      }),
      ...overrides,
      config: {
        actionId: type,
        parameters: overrides.config ?? {},
      },
      type: 'genfeedAction',
    };
  }

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
    versionId: 'version-1',
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
    mockExecutor = vi.fn(async (node) => buildFixtureOutput(node.type));
    engine.registerExecutor('imageGen', mockExecutor);
    engine.registerExecutor('upscale', mockExecutor);
    engine.registerExecutor('publish', mockExecutor);
  });

  describe('registerExecutor / getExecutor', () => {
    it('should register an action executor behind the shared action envelope', () => {
      const executor = vi.fn();
      const registrationEngine = new WorkflowEngine();
      registrationEngine.registerExecutor('imageGen', executor);

      expect(registrationEngine.getRegisteredActionIds()).toContain('imageGen');
      expect(registrationEngine.getExecutor('genfeedAction')).toBeDefined();
    });

    it('should return undefined for unregistered type', () => {
      expect(engine.getExecutor('unknown')).toBeUndefined();
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
      const contextEngine = createTestEngine();
      const contextExecutor: NodeExecutor = vi.fn(async () =>
        buildFixtureOutput('imageGen'),
      );
      contextEngine.registerExecutor('imageGen', contextExecutor);

      const workflow = makeWorkflow([makeNode('n1', 'imageGen')]);

      await contextEngine.execute(workflow, { executionId: 'exec-1' });

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

    it('suspends a provider-callback action and does not dispatch downstream nodes', async () => {
      const suspendEngine = createTestEngine();
      const imageExecutor = vi.fn().mockResolvedValue({
        id: 'ingredient-1',
        model: 'flux',
        provider: 'replicate',
        status: 'PROCESSING',
      });
      const publishExecutor = vi
        .fn()
        .mockResolvedValue(buildFixtureOutput('publish'));
      suspendEngine.registerExecutor('imageGen', imageExecutor);
      suspendEngine.registerExecutor('publish', publishExecutor);
      const workflow = makeWorkflow(
        [makeNode('generate', 'imageGen'), makeNode('publish', 'publish')],
        [makeEdge('generate', 'publish')],
      );

      const result = await suspendEngine.execute(workflow, {
        executionId: 'execution-1',
      });

      expect(result.status).toBe('running');
      expect(result.completedAt).toBeUndefined();
      expect(result.nodeResults.get('generate')?.status).toBe('running');
      expect(publishExecutor).not.toHaveBeenCalled();
    });

    it('never transport-retries a provider-callback submission', async () => {
      const retryEngine = createTestEngine();
      const providerError = new Error('provider submit failed');
      const imageExecutor = vi.fn().mockRejectedValue(providerError);
      retryEngine.registerExecutor('imageGen', imageExecutor);

      const result = await retryEngine.execute(
        makeWorkflow([makeNode('generate', 'imageGen')]),
        {
          executionId: 'execution-1',
          maxRetries: 3,
        },
      );

      expect(result.status).toBe('failed');
      expect(imageExecutor).toHaveBeenCalledOnce();
    });

    it('should execute nodes in dependency order', async () => {
      const orderEngine = createTestEngine();
      const executionOrder: string[] = [];
      const trackingExecutor: NodeExecutor = vi.fn(async (node) => {
        executionOrder.push(node.id);
        return buildFixtureOutput(node.type);
      });

      orderEngine.registerExecutor('imageGen', trackingExecutor);
      orderEngine.registerExecutor('upscale', trackingExecutor);

      const workflow = makeWorkflow(
        [makeNode('n1', 'imageGen'), makeNode('n2', 'upscale')],
        [makeEdge('n1', 'n2', { targetHandle: 'media' })],
      );

      await orderEngine.execute(workflow);

      expect(executionOrder).toEqual(['n1', 'n2']);
    });

    it('should handle diamond dependency graph', async () => {
      const diamondEngine = createTestEngine();
      const executionOrder: string[] = [];
      const trackingExecutor: NodeExecutor = vi.fn(async (node) => {
        executionOrder.push(node.id);
        return buildFixtureOutput(node.type);
      });

      diamondEngine.registerExecutor('imageGen', trackingExecutor);
      diamondEngine.registerExecutor('upscale', trackingExecutor);
      diamondEngine.registerExecutor('publish', trackingExecutor);

      // Diamond:  A → B, A → C, B → D, C → D
      const workflow = makeWorkflow(
        [
          makeNode('A', 'imageGen'),
          makeNode('B', 'upscale'),
          makeNode('C', 'upscale'),
          makeNode('D', 'publish'),
        ],
        [
          makeEdge('A', 'B', { targetHandle: 'media' }),
          makeEdge('A', 'C', { targetHandle: 'media' }),
          makeEdge('B', 'D', { targetHandle: 'media' }),
          makeEdge('C', 'D', { targetHandle: 'media' }),
        ],
      );

      await diamondEngine.execute(workflow);

      // A must come first, D must come last
      expect(executionOrder[0]).toBe('A');
      expect(executionOrder[3]).toBe('D');
      // B and C can be in either order
      expect(executionOrder.slice(1, 3).sort()).toEqual(['B', 'C']);
    });

    it('should handle independent parallel branches', async () => {
      const workflow = makeWorkflow([
        makeNode('n1', 'imageGen'),
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
      const gatherEngine = createTestEngine();
      const capturedInputs: Map<string, unknown>[] = [];
      const capturingExecutor: NodeExecutor = vi.fn(async (node, inputs) => {
        capturedInputs.push(new Map(inputs));
        return buildFixtureOutput(node.type);
      });

      gatherEngine.registerExecutor('imageGen', capturingExecutor);
      gatherEngine.registerExecutor('upscale', capturingExecutor);

      const workflow = makeWorkflow(
        [makeNode('n1', 'imageGen'), makeNode('n2', 'upscale')],
        [makeEdge('n1', 'n2', { targetHandle: 'media' })],
      );

      await gatherEngine.execute(workflow);

      // First node should have empty inputs
      expect(capturedInputs[0].size).toBe(0);
      // Second node should receive first node's output keyed by targetHandle
      expect(capturedInputs[1].get('media')).toEqual(
        buildFixtureOutput('imageGen'),
      );
    });

    it('should use source node id as key when targetHandle is absent', async () => {
      const gatherEngine = createTestEngine();
      const capturedInputs: Map<string, unknown>[] = [];
      const capturingExecutor: NodeExecutor = vi.fn(async (node, inputs) => {
        capturedInputs.push(new Map(inputs));
        return buildFixtureOutput(node.type);
      });

      gatherEngine.registerExecutor('imageGen', capturingExecutor);
      gatherEngine.registerExecutor('upscale', capturingExecutor);

      // The source node id is deliberately named after a real `upscale`
      // input field ("media") — the fallback key is the literal source
      // node id, and under closed-schema contract validation that id must
      // be a declared field of the downstream action for the edge to
      // validate when no explicit targetHandle is set.
      const workflow = makeWorkflow(
        [makeNode('media', 'imageGen'), makeNode('n2', 'upscale')],
        [makeEdge('media', 'n2')],
      );

      await gatherEngine.execute(workflow);

      expect(capturedInputs[1].get('media')).toEqual(
        buildFixtureOutput('imageGen'),
      );
    });

    it('should read sourceHandle field and write it to targetHandle', async () => {
      const gatherEngine = createTestEngine();
      const capturedInputs: Map<string, unknown>[] = [];
      const sourceExecutor: NodeExecutor = vi.fn(async () => ({
        id: 'ingredient-42',
        model: 'flux',
        provider: 'replicate',
        status: 'succeeded',
      }));
      const targetExecutor: NodeExecutor = vi.fn(async (_node, inputs) => {
        capturedInputs.push(new Map(inputs));
        return buildFixtureOutput('upscale');
      });

      gatherEngine.registerExecutor('imageGen', sourceExecutor);
      gatherEngine.registerExecutor('upscale', targetExecutor);

      const workflow = makeWorkflow(
        [makeNode('n1', 'imageGen'), makeNode('n2', 'upscale')],
        [
          makeEdge('n1', 'n2', {
            sourceHandle: 'id',
            targetHandle: 'model',
          }),
        ],
      );

      await gatherEngine.execute(workflow);

      expect(capturedInputs[0].get('model')).toBe('ingredient-42');
    });

    it('does not route an inactive explicit sourceHandle', async () => {
      const gatherEngine = createTestEngine();
      const capturedInputs: Map<string, unknown>[] = [];
      const sourceExecutor: NodeExecutor = vi.fn(async () =>
        buildFixtureOutput('imageGen'),
      );
      const targetExecutor: NodeExecutor = vi.fn(async (_node, inputs) => {
        capturedInputs.push(new Map(inputs));
        return buildFixtureOutput('upscale');
      });
      gatherEngine.registerExecutor('imageGen', sourceExecutor);
      gatherEngine.registerExecutor('upscale', targetExecutor);
      gatherEngine.registerExecutor('workflowInput', async () => undefined);

      const result = await gatherEngine.execute(
        makeWorkflow(
          [
            makeNode('n1', 'imageGen'),
            makeNode('n2', 'upscale'),
            makeNode('activation', 'workflowInput'),
          ],
          [
            makeEdge('activation', 'n2'),
            makeEdge('n1', 'n2', {
              sourceHandle: 'failure',
              targetHandle: 'failure',
            }),
          ],
        ),
      );

      expect(capturedInputs[0]).toEqual(new Map());
      expect(capturedInputs).toHaveLength(1);
      expect(targetExecutor).toHaveBeenCalledTimes(1);
      expect(sourceExecutor).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('completed');
    });

    it('collects repeated target handles into an ordered array', async () => {
      const capturedInputs: Map<string, unknown>[] = [];
      const targetExecutor: NodeExecutor = vi.fn(async (_node, inputs) => {
        capturedInputs.push(new Map(inputs));
        return buildFixtureOutput('videoStitch');
      });
      engine.registerExecutor('videoStitch', targetExecutor);

      const workflow = makeWorkflow(
        [
          makeNode('source-1', 'publish'),
          makeNode('source-2', 'publish'),
          makeNode('target', 'videoStitch'),
        ],
        [
          makeEdge('source-1', 'target', { targetHandle: 'videos' }),
          makeEdge('source-2', 'target', { targetHandle: 'videos' }),
        ],
      );

      await engine.execute(workflow);

      expect(capturedInputs[0].get('videos')).toEqual([
        buildFixtureOutput('publish'),
        buildFixtureOutput('publish'),
      ]);
    });
  });

  describe('execute — failure handling', () => {
    it('should stop execution on node failure', async () => {
      const failureEngine = createTestEngine();
      const failingExecutor: NodeExecutor = vi
        .fn()
        .mockRejectedValue(new Error('generation failed'));
      failureEngine.registerExecutor('imageGen', failingExecutor);
      // n2 never actually dispatches (n1 fails first), but coverage is
      // validated for every planned node up front, so it still needs a
      // registered executor for the plan to reach n1's dispatch at all.
      failureEngine.registerExecutor('upscale', vi.fn());

      const workflow = makeWorkflow(
        [makeNode('n1', 'imageGen'), makeNode('n2', 'upscale')],
        [makeEdge('n1', 'n2')],
      );

      const result = await failureEngine.execute(workflow);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('generation failed');
      expect(result.nodeResults.get('n1')?.status).toBe('failed');
      expect(result.nodeResults.has('n2')).toBe(false);
    });

    it('preserves WorkflowExecutionError output on a failed node', async () => {
      const failureEngine = createTestEngine();
      failureEngine.registerExecutor('imageGen', async () => {
        throw new PermanentExecutionError('character continuity QA is drift', {
          output: { continuityQa: { status: 'completed' }, video: null },
        });
      });
      failureEngine.registerExecutor('upscale', vi.fn());

      const result = await failureEngine.execute(
        makeWorkflow(
          [makeNode('n1', 'imageGen'), makeNode('n2', 'upscale')],
          [makeEdge('n1', 'n2')],
        ),
      );

      expect(result.status).toBe('failed');
      expect(result.nodeResults.get('n1')?.output).toEqual({
        continuityQa: { status: 'completed' },
        video: null,
      });
      expect(result.nodeResults.has('n2')).toBe(false);
    });

    it('should fail when no executor is registered for a node type', async () => {
      const workflow = makeWorkflow([makeNode('n1', 'unknownType')]);

      const result = await engine.execute(workflow);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('has no executor for unknownType');
    });

    it('fails executor coverage before running an earlier valid action', async () => {
      const firstExecutor = vi.fn().mockResolvedValue({ result: 'ok' });
      const coverageEngine = new WorkflowEngine();
      coverageEngine.registerExecutor('imageGen', firstExecutor);
      const workflow = makeWorkflow(
        [makeNode('n1', 'imageGen'), makeNode('n2', 'videoStitch')],
        [makeEdge('n1', 'n2')],
      );

      const result = await coverageEngine.execute(workflow);

      expect(result.status).toBe('failed');
      expect(result.error).toContain(
        'No executor registered for Genfeed action: videoStitch',
      );
      expect(firstExecutor).not.toHaveBeenCalled();
      expect(result.nodeResults.size).toBe(0);
    });
  });

  describe('execute — locked nodes', () => {
    it('should skip locked nodes with cached output', async () => {
      const workflow = makeWorkflow(
        [
          makeNode('n1', 'imageGen', {
            cachedOutput: { image: 'cached.png' },
            isLocked: true,
          }),
          makeNode('n2', 'upscale'),
        ],
        [makeEdge('n1', 'n2', { targetHandle: 'media' })],
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
      const lockedEngine = createTestEngine();
      const capturedInputs: Map<string, unknown>[] = [];
      const capturingExecutor: NodeExecutor = vi.fn(async (_node, inputs) => {
        capturedInputs.push(new Map(inputs));
        return buildFixtureOutput('upscale');
      });

      lockedEngine.registerExecutor('upscale', capturingExecutor);

      const workflow = makeWorkflow(
        [
          makeNode('n1', 'imageGen', {
            cachedOutput: { image: 'cached.png' },
            isLocked: true,
          }),
          makeNode('n2', 'upscale'),
        ],
        [makeEdge('n1', 'n2', { targetHandle: 'media' })],
        { lockedNodeIds: ['n1'] },
      );

      await lockedEngine.execute(workflow);

      expect(capturedInputs[0].get('media')).toEqual({ image: 'cached.png' });
    });

    it('rerenders edited localized speech and composition while reusing both generated scenes', async () => {
      const rerunEngine = createTestEngine();
      const generation = vi.fn();
      const localize = vi.fn(async () => ({
        audio: {
          id: 'spanish-voice-2',
          audioUrl: 'https://cdn.example.com/es-2.mp3',
          duration: 30,
          status: 'completed',
        },
        transcript: {
          text: 'Original',
          segments: [{ start: 0, end: 30, text: 'Original' }],
        },
        translatedScript: 'Spanish revision',
        segments: [{ start: 0, end: 30, text: 'Spanish revision' }],
        duration: 30,
      }));
      const lipSync = vi.fn(async () => ({
        id: 'localized',
        status: 'completed',
        videoUrl: 'https://cdn.example.com/localized.mp4',
      }));
      const stitch = vi.fn<NodeExecutor>(async () =>
        buildFixtureOutput('videoStitch'),
      );
      rerunEngine.registerExecutor('videoGen', generation);
      rerunEngine.registerExecutor('localizeSpeech', localize);
      rerunEngine.registerExecutor('lipSync', lipSync);
      rerunEngine.registerExecutor('videoStitch', stitch);
      const workflow = makeWorkflow(
        [
          {
            ...createExecutableActionNode({
              actionId: 'videoGen',
              id: 'scene-a',
              isLocked: true,
            }),
            cachedOutput: { videoUrl: 'https://cdn.example.com/a.mp4' },
          },
          {
            ...createExecutableActionNode({
              actionId: 'videoGen',
              id: 'scene-b',
              isLocked: true,
            }),
            cachedOutput: { videoUrl: 'https://cdn.example.com/b.mp4' },
          },
          createExecutableActionNode({
            actionId: 'localizeSpeech',
            id: 'speech',
            parameters: {
              brandId: 'brand',
              targetLanguage: 'es',
              voiceId: 'new-voice',
              script: 'Spanish revision',
            },
          }),
          createExecutableActionNode({ actionId: 'lipSync', id: 'sync' }),
          createExecutableActionNode({ actionId: 'videoStitch', id: 'final' }),
        ],
        [
          makeEdge('scene-a', 'speech', {
            sourceHandle: 'videoUrl',
            targetHandle: 'video',
          }),
          makeEdge('scene-a', 'sync', {
            sourceHandle: 'videoUrl',
            targetHandle: 'video',
          }),
          makeEdge('speech', 'sync', {
            sourceHandle: 'audio',
            targetHandle: 'audio',
          }),
          makeEdge('sync', 'final', {
            sourceHandle: 'videoUrl',
            targetHandle: 'videos',
          }),
          makeEdge('scene-b', 'final', {
            sourceHandle: 'videoUrl',
            targetHandle: 'videos',
          }),
        ],
        { lockedNodeIds: ['scene-a', 'scene-b'] },
      );
      const result = await rerunEngine.execute(workflow);
      expect(result.status).toBe('completed');
      expect(generation).not.toHaveBeenCalled();
      expect(localize).toHaveBeenCalledTimes(1);
      expect(lipSync).toHaveBeenCalledTimes(1);
      expect(stitch).toHaveBeenCalledTimes(1);
      expect(result.nodeResults.get('scene-a')?.status).toBe('skipped');
      expect(result.nodeResults.get('scene-b')?.status).toBe('skipped');
      expect(stitch.mock.calls[0]?.[1]?.get('videos')).toEqual([
        'https://cdn.example.com/localized.mp4',
        'https://cdn.example.com/b.mp4',
      ]);
    });

    it('should execute locked nodes when respectLocks is false', async () => {
      const workflow = makeWorkflow(
        [
          makeNode('n1', 'imageGen', {
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
        creditCosts: { imageGen: 10, upscale: 5 },
      });
      engineWithCosts.registerExecutor('imageGen', mockExecutor);
      engineWithCosts.registerExecutor('upscale', mockExecutor);

      const workflow = makeWorkflow([
        makeNode('n1', 'imageGen'),
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
        creditCosts: { imageGen: 10 },
      });
      engineWithCosts.registerExecutor('imageGen', mockExecutor);

      const workflow = makeWorkflow([makeNode('n1', 'imageGen')]);

      const result = await engineWithCosts.execute(workflow, {
        availableCredits: 100,
      });

      expect(result.status).toBe('completed');
    });

    it('should track total credits used', async () => {
      const engineWithCosts = new WorkflowEngine({
        creditCosts: { imageGen: 10, upscale: 5 },
      });
      engineWithCosts.registerExecutor('imageGen', mockExecutor);
      engineWithCosts.registerExecutor('upscale', mockExecutor);

      const workflow = makeWorkflow([
        makeNode('n1', 'imageGen'),
        makeNode('n2', 'upscale'),
      ]);

      const result = await engineWithCosts.execute(workflow);

      expect(result.totalCreditsUsed).toBe(15);
    });
  });

  describe('execute — dry run', () => {
    it('should return completed without executing any nodes', async () => {
      const workflow = makeWorkflow([makeNode('n1', 'imageGen')]);

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
        [makeNode('n1', 'imageGen'), makeNode('n2', 'upscale')],
        [makeEdge('n1', 'n2', { targetHandle: 'media' })],
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

      const workflow = makeWorkflow([makeNode('n1', 'imageGen')]);

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

      const workflow = makeWorkflow([makeNode('n1', 'imageGen')]);

      const result = await engine.execute(workflow, { onProgress });

      expect(result.status).toBe('completed');
    });
  });

  describe('execute — partial execution', () => {
    it('should only execute selected nodes', async () => {
      const partialEngine = createTestEngine();
      const executionOrder: string[] = [];
      const trackingExecutor: NodeExecutor = vi.fn(async (node) => {
        executionOrder.push(node.id);
        return buildFixtureOutput(node.type);
      });

      partialEngine.registerExecutor('imageGen', trackingExecutor);
      partialEngine.registerExecutor('upscale', trackingExecutor);
      partialEngine.registerExecutor('publish', trackingExecutor);

      const workflow = makeWorkflow(
        [
          makeNode('n1', 'imageGen'),
          makeNode('n2', 'upscale'),
          makeNode('n3', 'publish'),
        ],
        [makeEdge('n1', 'n2'), makeEdge('n2', 'n3')],
      );

      // Only execute n2, but n1 output is needed — n1 is not cached
      // so it should fail with missing dependency
      const result = await partialEngine.execute(workflow, { nodeIds: ['n2'] });

      // n2 depends on n1 which has no cache — plan should be invalid
      expect(result.status).toBe('failed');
      expect(result.error).toContain('not available in cache');
    });

    it('should succeed with selected nodes when dependencies are cached', async () => {
      const workflow = makeWorkflow(
        [
          makeNode('n1', 'imageGen', {
            cachedOutput: 'cached-n1-output',
            isLocked: true,
          }),
          makeNode('n2', 'upscale'),
        ],
        [makeEdge('n1', 'n2', { targetHandle: 'media' })],
        { lockedNodeIds: ['n1'] },
      );

      const result = await engine.execute(workflow, { nodeIds: ['n2'] });

      expect(result.status).toBe('completed');
      expect(result.nodeResults.get('n2')?.status).toBe('completed');
    });

    it('should fail for non-existent nodeIds', async () => {
      const workflow = makeWorkflow([makeNode('n1', 'imageGen')]);

      const result = await engine.execute(workflow, {
        nodeIds: ['nonexistent'],
      });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('not found');
    });
  });

  describe('resume', () => {
    it('should resume from a failed run', async () => {
      const resumeEngine = createTestEngine();
      // First run: n1 succeeds, n2 fails
      const callCount = { n2: 0 };
      const executorThatFailsOnce: NodeExecutor = vi.fn(async (node) => {
        if (node.id === 'n2') {
          callCount.n2++;
          if (callCount.n2 === 1) {
            throw new Error('temporary failure');
          }
        }
        return buildFixtureOutput(node.type);
      });

      resumeEngine.registerExecutor('imageGen', executorThatFailsOnce);
      resumeEngine.registerExecutor('upscale', executorThatFailsOnce);

      const workflow = makeWorkflow(
        [makeNode('n1', 'imageGen'), makeNode('n2', 'upscale')],
        [makeEdge('n1', 'n2', { targetHandle: 'media' })],
      );

      // First execution — n2 fails
      const firstRun = await resumeEngine.execute(workflow, { maxRetries: 0 });
      expect(firstRun.status).toBe('failed');

      // Resume — n2 should succeed this time
      const resumedRun = await resumeEngine.resume(workflow, firstRun, {
        maxRetries: 0,
      });

      expect(resumedRun.status).toBe('completed');
    });

    it('should not resume a completed run', async () => {
      const workflow = makeWorkflow([makeNode('n1', 'imageGen')]);

      const completedRun = await engine.execute(workflow);
      expect(completedRun.status).toBe('completed');

      const resumeResult = await engine.resume(workflow, completedRun);

      expect(resumeResult.status).toBe('failed');
      expect(resumeResult.error).toContain('Cannot resume');
    });
  });

  describe('execute — cancellation', () => {
    it('should stop dispatching and return cancelled when aborted mid-execution', async () => {
      const cancellationEngine = createTestEngine();
      const controller = new AbortController();
      const executed: string[] = [];
      const abortingExecutor: NodeExecutor = vi.fn(async (node) => {
        executed.push(node.id);
        if (node.id === 'n1') {
          controller.abort();
        }
        return buildFixtureOutput(node.type);
      });

      cancellationEngine.registerExecutor('imageGen', abortingExecutor);
      cancellationEngine.registerExecutor('upscale', abortingExecutor);
      cancellationEngine.registerExecutor('publish', abortingExecutor);

      // Sequential chain so the abort lands before n2/n3 are dispatched.
      const workflow = makeWorkflow(
        [
          makeNode('n1', 'imageGen'),
          makeNode('n2', 'upscale'),
          makeNode('n3', 'publish'),
        ],
        [makeEdge('n1', 'n2'), makeEdge('n2', 'n3')],
      );

      const result = await cancellationEngine.execute(workflow, {
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
        return buildFixtureOutput(node.type);
      });
      // n2 is already in flight when the abort fires; it fails during the drain.
      const failer: NodeExecutor = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('sibling failed during drain');
      });

      cancelEngine.registerExecutor('imageGen', aborter);
      cancelEngine.registerExecutor('upscale', failer);
      cancelEngine.registerExecutor('publish', aborter);

      // n1 + n2 occupy both slots; n3 is deferred so the dispatch phase re-runs
      // after n1 settles and observes the abort, then n2 fails during drain.
      const workflow = makeWorkflow([
        makeNode('n1', 'imageGen'),
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
        return buildFixtureOutput('imageGen');
      });

      // Fresh engine configured with maxConcurrency: 3, since imageGen is
      // already registered on the shared beforeEach engine.
      const concurrencyEngine = createTestEngine({ maxConcurrency: 3 });
      concurrencyEngine.registerExecutor('imageGen', gatedExecutor);

      // 6 independent branches (no edges) all eligible to run at once.
      const workflow = makeWorkflow([
        makeNode('n1', 'imageGen'),
        makeNode('n2', 'imageGen'),
        makeNode('n3', 'imageGen'),
        makeNode('n4', 'imageGen'),
        makeNode('n5', 'imageGen'),
        makeNode('n6', 'imageGen'),
      ]);

      let done = false;
      const runPromise = concurrencyEngine.execute(workflow).then((r) => {
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
      const result = engine.estimateCredits([makeNode('n1', 'imageGen')]);

      expect(result).toBe(0);
    });

    it('should sum credits from cost config', () => {
      const engineWithCosts = new WorkflowEngine({
        creditCosts: { imageGen: 10, upscale: 5 },
      });

      const result = engineWithCosts.estimateCredits([
        makeNode('n1', 'imageGen'),
        makeNode('n2', 'upscale'),
        makeNode('n3', 'imageGen'),
      ]);

      expect(result).toBe(25);
    });
  });
});

describe('WorkflowEngine failure-controlled graphs', () => {
  function turn(failedNode: string | null, failCompensation = false) {
    const engine = new WorkflowEngine({ maxConcurrency: 1 });
    const calls: string[] = [];
    const failures: unknown[] = [];
    for (const [id, actionId, output] of [
      [
        'prepare',
        'agent.turn.prepare',
        { contextVersion: 1, state: {}, threadId: 'thread' },
      ],
      [
        'infer',
        'agent.turn.infer',
        { decision: 'final', final: {}, state: {}, toolItems: [] },
      ],
      [
        'finalize',
        'agent.turn.finalize',
        {
          content: 'Done',
          creditsUsed: 0,
          summary: 'Done',
          threadId: 'thread',
        },
      ],
      ['compensate', 'agent.turn.fail', { error: 'boom', threadId: 'thread' }],
    ] as const) {
      engine.registerExecutor(actionId, async (_node, inputs) => {
        calls.push(id);
        if (id === 'compensate') {
          failures.push(inputs.get('failure'));
          if (failCompensation)
            throw new PermanentExecutionError('compensation failed');
        }
        if (id === failedNode) throw new PermanentExecutionError('boom');
        return output;
      });
    }
    const workflow = makeWorkflow(
      [
        createExecutableActionNode({
          id: 'prepare',
          actionId: 'agent.turn.prepare',
          parameters: { request: {} },
        }),
        createExecutableActionNode({
          id: 'infer',
          actionId: 'agent.turn.infer',
        }),
        createExecutableActionNode({
          id: 'finalize',
          actionId: 'agent.turn.finalize',
        }),
        createExecutableActionNode({
          id: 'compensate',
          actionId: 'agent.turn.fail',
          parameters: { request: {} },
        }),
      ],
      [
        makeEdge('prepare', 'infer', {
          sourceHandle: 'state',
          targetHandle: 'state',
        }),
        makeEdge('infer', 'finalize', {
          sourceHandle: 'state',
          targetHandle: 'state',
        }),
        makeEdge('infer', 'finalize', {
          sourceHandle: 'final',
          targetHandle: 'final',
        }),
        ...['prepare', 'infer', 'finalize'].map((source) =>
          makeEdge(source, 'compensate', {
            sourceHandle: 'failure',
            targetHandle: 'failure',
          }),
        ),
      ],
    );
    return { engine, workflow, calls, failures };
  }

  it.each([null, 'prepare', 'infer', 'finalize'])(
    'routes exactly one actual failure to a shared sink (%s)',
    async (failedNode) => {
      const fixture = turn(failedNode);
      const result = await fixture.engine.execute(fixture.workflow, {
        maxRetries: 0,
      });
      const sources = ['prepare', 'infer', 'finalize'];
      expect(fixture.calls).toEqual(
        failedNode
          ? [...sources.slice(0, sources.indexOf(failedNode) + 1), 'compensate']
          : sources,
      );
      expect(result.status).toBe(failedNode ? 'failed' : 'completed');
      expect(fixture.failures).toEqual(
        failedNode
          ? [
              expect.objectContaining({
                failedNodeId: failedNode,
                error: 'boom',
                nodeOutputs: expect.any(Object),
              }),
            ]
          : [],
      );
      if (failedNode) {
        expect(result.nodeResults.get(failedNode)?.error).toBe('boom');
        expect(result.error).toBe('boom');
        for (const skipped of sources.slice(sources.indexOf(failedNode) + 1))
          expect(result.nodeResults.has(skipped)).toBe(false);
      } else
        expect(result.nodeResults.get('compensate')).toMatchObject({
          status: 'skipped',
          creditsUsed: 0,
        });
    },
  );

  it('preserves original failure when compensation also fails', async () => {
    const fixture = turn('infer', true);
    const result = await fixture.engine.execute(fixture.workflow, {
      maxRetries: 0,
    });
    expect(result.status).toBe('failed');
    expect(result.error).toBe('boom');
    expect(result.nodeResults.get('compensate')?.error).toBe(
      'compensation failed',
    );
  });

  it.each([false, true])(
    'uses required failure as control while retaining begin state (failed: %s)',
    async (failed) => {
      const engine = new WorkflowEngine({ maxConcurrency: 1 });
      const state = {
        acquired: true,
        lockKey: 'owned',
        organizationId: 'org-1',
      };
      const release = vi.fn(async () => ({
        organizationId: 'org-1',
        released: true,
      }));
      engine.registerExecutor('agent.autopilot.begin', async () => state);
      engine.registerExecutor('workflowInput', async () => {
        if (failed) throw new PermanentExecutionError('dispatch failed');
        return { failure: 'successful data is not a failure' };
      });
      engine.registerExecutor('agent.autopilot.fail', async (_node, inputs) => {
        expect(inputs.get('state')).toEqual(state);
        expect(inputs.get('failure')).toMatchObject({
          failedNodeId: 'dispatch',
          error: 'dispatch failed',
        });
        return release();
      });
      const graph = makeWorkflow(
        [
          createExecutableActionNode({
            id: 'begin',
            actionId: 'agent.autopilot.begin',
          }),
          makeNode('dispatch', 'workflowInput'),
          createExecutableActionNode({
            id: 'release',
            actionId: 'agent.autopilot.fail',
          }),
        ],
        [
          makeEdge('begin', 'dispatch'),
          makeEdge('begin', 'release', { targetHandle: 'state' }),
          makeEdge('dispatch', 'release', {
            sourceHandle: 'failure',
            targetHandle: 'failure',
          }),
        ],
      );
      const result = await engine.execute(graph, { maxRetries: 0 });
      expect(result.status).toBe(failed ? 'failed' : 'completed');
      expect(release).toHaveBeenCalledTimes(failed ? 1 : 0);
    },
  );

  it('keeps a generic mixed join reachable on its ordinary success edge', async () => {
    const engine = new WorkflowEngine({ maxConcurrency: 1 });
    const called: string[] = [];
    engine.registerExecutor('workflowInput', async (node) => {
      called.push(node.id);
      return { value: node.id };
    });
    const result = await engine.execute(
      makeWorkflow(
        ['begin', 'work', 'join'].map((id) => makeNode(id, 'workflowInput')),
        [
          makeEdge('begin', 'work'),
          makeEdge('begin', 'join'),
          makeEdge('work', 'join', {
            sourceHandle: 'failure',
            targetHandle: 'failure',
          }),
        ],
      ),
    );
    expect(result.status).toBe('completed');
    expect(called).toEqual(['begin', 'work', 'join']);
  });

  it('drains an inflight sibling, blocks new success work, and runs compensation', async () => {
    const engine = new WorkflowEngine({
      maxConcurrency: 2,
      creditCosts: { workflowInput: 3 },
    });
    let releaseSibling!: () => void;
    const siblingReady = new Promise<void>((resolve) => {
      releaseSibling = resolve;
    });
    const calls: string[] = [];
    engine.registerExecutor('workflowInput', async (node) => {
      calls.push(node.id);
      if (node.id === 'failure')
        throw new PermanentExecutionError('first failure');
      if (node.id === 'sibling') await siblingReady;
      if (node.id === 'compensate') releaseSibling();
      return { value: node.id };
    });
    const graph = makeWorkflow(
      ['failure', 'sibling', 'pending', 'compensate'].map((id) =>
        makeNode(id, 'workflowInput'),
      ),
      [
        makeEdge('failure', 'compensate', {
          sourceHandle: 'failure',
          targetHandle: 'failure',
        }),
        makeEdge('sibling', 'pending'),
      ],
    );
    const result = await engine.execute(graph, { maxRetries: 0 });
    expect(result.status).toBe('failed');
    expect(calls).toContain('compensate');
    expect(calls).not.toContain('pending');
    expect(result.nodeResults.get('sibling')?.status).toBe('completed');
    expect(result.nodeResults.has('pending')).toBe(false);
    expect(result.error).toBe('first failure');
    expect(result.nodeResults.get('failure')?.creditsUsed).toBe(0);
    expect(result.totalCreditsUsed).toBe(6);
    expect(
      [...result.nodeResults.values()].reduce(
        (sum, node) => sum + node.creditsUsed,
        0,
      ),
    ).toBe(result.totalCreditsUsed);
  });

  it.each([
    { first: 'generate', abort: false },
    { first: 'failure', abort: false },
    { first: 'generate', abort: true },
    { first: 'failure', abort: true },
  ])(
    'retains failure over suspension and cancellation priority ($first first, abort=$abort)',
    async ({ first, abort }) => {
      const engine = createTestEngine({
        maxConcurrency: 2,
        creditCosts: { imageGen: 7, workflowInput: 3, publish: 11 },
      });
      const controller = new AbortController();
      let releaseGenerate!: () => void;
      let releaseFailure!: () => void;
      const generateGate = new Promise<void>((resolve) => {
        releaseGenerate = resolve;
      });
      const failureGate = new Promise<void>((resolve) => {
        releaseFailure = resolve;
      });
      let started = 0;
      const markStarted = () => {
        started++;
        if (started === 2) {
          if (first === 'generate') releaseGenerate();
          else releaseFailure();
        }
      };
      const imageExecutor = vi.fn(async () => {
        markStarted();
        await generateGate;
        return {
          id: 'ingredient-1',
          model: 'flux',
          provider: 'replicate',
          status: 'PROCESSING',
        };
      });
      const failureExecutor = vi.fn(async () => {
        markStarted();
        await failureGate;
        throw new PermanentExecutionError('sibling failed');
      });
      const downstreamExecutor = vi.fn(async () =>
        buildFixtureOutput('publish'),
      );
      engine.registerExecutor('imageGen', imageExecutor);
      engine.registerExecutor('workflowInput', failureExecutor);
      engine.registerExecutor('publish', downstreamExecutor);
      const result = await engine.execute(
        makeWorkflow(
          [
            makeNode('generate', 'imageGen'),
            makeNode('failure', 'workflowInput'),
            makeNode('downstream', 'publish'),
          ],
          [
            makeEdge('generate', 'downstream'),
            makeEdge('failure', 'downstream'),
          ],
        ),
        {
          executionId: 'execution-suspended-failed',
          maxRetries: 0,
          abortSignal: controller.signal,
          onNodeStatusChange: (event) => {
            const firstSettled =
              event.nodeId === first &&
              (event.newStatus === 'failed' || event.output !== undefined);
            if (!firstSettled) return;
            if (abort) controller.abort();
            if (first === 'generate') releaseFailure();
            else releaseGenerate();
          },
        },
      );
      expect(imageExecutor).toHaveBeenCalledTimes(1);
      expect(failureExecutor).toHaveBeenCalledTimes(1);
      expect(result.nodeResults.get('generate')?.status).toBe('running');
      expect(result.nodeResults.get('failure')?.status).toBe('failed');
      expect(result.status).toBe(abort ? 'cancelled' : 'failed');
      expect(result.error).toBe('sibling failed');
      expect(result.completedAt).toBeDefined();
      expect(downstreamExecutor).not.toHaveBeenCalled();
      expect(result.nodeResults.has('downstream')).toBe(false);
      expect(result.nodeResults.get('failure')?.creditsUsed).toBe(0);
      expect(result.totalCreditsUsed).toBe(7);
      expect(
        [...result.nodeResults.values()].reduce(
          (sum, node) => sum + node.creditsUsed,
          0,
        ),
      ).toBe(result.totalCreditsUsed);
    },
  );

  it('does not dispatch pending compensation after abort', async () => {
    const engine = new WorkflowEngine({ maxConcurrency: 1 });
    const abort = new AbortController();
    const calls: string[] = [];
    engine.registerExecutor('workflowInput', async (node) => {
      calls.push(node.id);
      abort.abort();
      throw new PermanentExecutionError('failed during abort');
    });
    const result = await engine.execute(
      makeWorkflow(
        ['work', 'compensate'].map((id) => makeNode(id, 'workflowInput')),
        [
          makeEdge('work', 'compensate', {
            sourceHandle: 'failure',
            targetHandle: 'failure',
          }),
        ],
      ),
      { abortSignal: abort.signal, maxRetries: 0 },
    );
    expect(result.status).toBe('cancelled');
    expect(calls).toEqual(['work']);
  });
  it('does not fabricate failure from a locked successful output or rerun cached compensation', async () => {
    const engine = new WorkflowEngine({ maxConcurrency: 1 });
    const called: string[] = [];
    engine.registerExecutor('workflowInput', async (node) => {
      called.push(node.id);
      return {};
    });
    const source = makeNode('source', 'workflowInput', {
      isLocked: true,
      cachedOutput: { failure: { error: 'successful JSON data' } },
    });
    const sink = makeNode('sink', 'workflowInput', {
      isLocked: true,
      cachedOutput: { compensated: true },
    });
    const result = await engine.execute(
      makeWorkflow(
        [source, sink],
        [
          makeEdge('source', 'sink', {
            sourceHandle: 'failure',
            targetHandle: 'failure',
          }),
        ],
        { lockedNodeIds: ['source', 'sink'] },
      ),
    );
    expect(result.status).toBe('completed');
    expect(called).toEqual([]);
    expect(result.totalCreditsUsed).toBe(0);
  });
  it.each([false, true])(
    'refuses resume after completed compensation, including undefined output (%s)',
    async (undefinedOutput) => {
      const engine = new WorkflowEngine({ maxConcurrency: 1 });
      let shouldFail = true;
      const calls: string[] = [];
      engine.registerExecutor('workflowInput', async (node) => {
        calls.push(node.id);
        if (node.id === 'work' && shouldFail)
          throw new PermanentExecutionError('boom');
        return undefinedOutput ? undefined : { value: node.id };
      });
      const graph = makeWorkflow(
        ['work', 'compensate'].map((id) => makeNode(id, 'workflowInput')),
        [
          makeEdge('work', 'compensate', {
            sourceHandle: 'failure',
            targetHandle: 'failure',
          }),
        ],
      );
      const previous = await engine.execute(graph, { maxRetries: 0 });
      expect(previous.nodeResults.get('compensate')?.status).toBe('completed');
      shouldFail = false;
      calls.length = 0;
      const before = structuredClone(graph);
      const callback = vi.fn();
      const resumed = await engine.resume(graph, previous, {
        onNodeStatusChange: callback,
        maxRetries: 0,
      });
      expect(resumed.error).toBe(
        'RESUME_AFTER_COMPLETED_COMPENSATION: completed failure compensation requires a new execution',
      );
      expect(resumed.status).toBe('failed');
      expect(resumed.nodeResults.size).toBe(0);
      expect(resumed.totalCreditsUsed).toBe(0);
      expect(calls).toEqual([]);
      expect(callback).not.toHaveBeenCalled();
      expect(graph).toEqual(before);
    },
  );

  it('refuses recorded completed cleanup descendants of a failed compensation without mutating cache', async () => {
    const engine = new WorkflowEngine({ maxConcurrency: 1 });
    const called = vi.fn();
    engine.registerExecutor('workflowInput', async (node) => {
      called(node.id);
      if (node.id !== 'cleanup') throw new PermanentExecutionError(node.id);
      return undefined;
    });
    const graph = makeWorkflow(
      ['work', 'compensate', 'cleanup'].map((id) =>
        makeNode(id, 'workflowInput'),
      ),
      [
        makeEdge('work', 'compensate', {
          sourceHandle: 'failure',
          targetHandle: 'failure',
        }),
        makeEdge('compensate', 'cleanup', {
          sourceHandle: 'failure',
          targetHandle: 'failure',
        }),
      ],
    );
    const previous = await engine.execute(graph, { maxRetries: 0 });
    expect(previous.nodeResults.get('compensate')?.status).toBe('failed');
    expect(previous.nodeResults.get('cleanup')?.status).toBe('completed');
    called.mockClear();
    const before = structuredClone(graph);
    expect((await engine.resume(graph, previous)).error).toMatch(
      /^RESUME_AFTER_COMPLETED_COMPENSATION:/,
    );
    expect(called).not.toHaveBeenCalled();
    expect(graph).toEqual(before);
  });

  it('resumes an uncompensated chain with cached nonselected predecessor and recomputes selected stale output', async () => {
    const engine = new WorkflowEngine({ maxConcurrency: 1 });
    let failed = true;
    const calls: string[] = [];
    engine.registerExecutor('workflowInput', async (node, inputs) => {
      calls.push(node.id);
      if (node.id === 'source' && failed)
        throw new PermanentExecutionError('boom');
      if (node.id === 'source')
        expect(inputs.get('input')).toEqual({ fresh: 'root' });
      return { fresh: node.id };
    });
    const graph = makeWorkflow(
      [
        makeNode('root', 'workflowInput'),
        makeNode('source', 'workflowInput'),
        makeNode('descendant', 'workflowInput', {
          cachedOutput: { stale: true },
        }),
      ],
      [
        makeEdge('root', 'source', { targetHandle: 'input' }),
        makeEdge('source', 'descendant', { targetHandle: 'input' }),
      ],
    );
    const previous = await engine.execute(graph, { maxRetries: 0 });
    expect(previous.status).toBe('failed');
    failed = false;
    calls.length = 0;
    const resumed = await engine.resume(graph, previous, { maxRetries: 0 });
    expect(resumed.status).toBe('completed');
    expect(calls).toEqual(['source', 'descendant']);
    expect(resumed.nodeResults.get('descendant')?.output).toEqual({
      fresh: 'descendant',
    });
  });

  it('does not refuse resume for only-failed compensation or a completed ordinary state ancestor', async () => {
    const engine = new WorkflowEngine({ maxConcurrency: 1 });
    let first = true;
    const calls: string[] = [];
    engine.registerExecutor('workflowInput', async (node) => {
      calls.push(node.id);
      if (first && node.id !== 'begin')
        throw new PermanentExecutionError('boom');
      return { value: node.id };
    });
    const graph = makeWorkflow(
      ['begin', 'work', 'compensate'].map((id) =>
        makeNode(id, 'workflowInput'),
      ),
      [
        makeEdge('begin', 'work'),
        makeEdge('begin', 'compensate', { targetHandle: 'state' }),
        makeEdge('work', 'compensate', {
          sourceHandle: 'failure',
          targetHandle: 'failure',
        }),
      ],
    );
    const previous = await engine.execute(graph, { maxRetries: 0 });
    expect(previous.nodeResults.get('begin')?.status).toBe('completed');
    expect(previous.nodeResults.get('compensate')?.status).toBe('failed');
    first = false;
    calls.length = 0;
    const resumed = await engine.resume(graph, previous, { maxRetries: 0 });
    expect(resumed.error ?? '').not.toMatch(
      /RESUME_AFTER_COMPLETED_COMPENSATION/,
    );
    expect(resumed.status).toBe('completed');
    expect(calls).toEqual(['work', 'compensate']);
  });
});
