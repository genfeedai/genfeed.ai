import {
  canExecuteNode,
  planPartialExecution,
} from '@workflow-engine/execution/partial-execution';
import {
  analyzeForResume,
  createCacheFromRun,
  mergeExecutionResults,
} from '@workflow-engine/execution/resume-handler';
import {
  calculateRetryDelay,
  isRetryableError,
} from '@workflow-engine/execution/retry-handler';
import type { ExecutableEdge, ExecutableNode } from '@workflow-engine/types';
import { DEFAULT_RETRY_CONFIG } from '@workflow-engine/types';
import { describe, expect, it } from 'vitest';

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

function makeEdge(source: string, target: string): ExecutableEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
  };
}

describe('planPartialExecution', () => {
  it('should create valid plan for a single root node', () => {
    const nodes = [makeNode('n1'), makeNode('n2')];
    const edges = [makeEdge('n1', 'n2')];
    const cache = new Map<string, unknown>();

    const plan = planPartialExecution(['n1'], nodes, edges, cache);

    expect(plan.isValid).toBe(true);
    expect(plan.nodesToExecute).toEqual(['n1']);
    expect(plan.errors).toHaveLength(0);
  });

  it('should report error for non-existent node', () => {
    const nodes = [makeNode('n1')];
    const edges: ExecutableEdge[] = [];
    const cache = new Map<string, unknown>();

    const plan = planPartialExecution(['nonexistent'], nodes, edges, cache);

    expect(plan.isValid).toBe(false);
    expect(plan.errors[0]).toContain('not found');
  });

  it('should identify missing dependencies', () => {
    const nodes = [makeNode('n1'), makeNode('n2')];
    const edges = [makeEdge('n1', 'n2')];
    const cache = new Map<string, unknown>();

    // Select n2 which depends on n1, but n1 is not cached
    const plan = planPartialExecution(['n2'], nodes, edges, cache);

    expect(plan.isValid).toBe(false);
    expect(plan.errors[0]).toContain('not available in cache');
  });

  it('should succeed when dependency output is in cache', () => {
    const nodes = [makeNode('n1'), makeNode('n2')];
    const edges = [makeEdge('n1', 'n2')];
    const cache = new Map<string, unknown>([['n1', 'cached-output']]);

    const plan = planPartialExecution(['n2'], nodes, edges, cache);

    expect(plan.isValid).toBe(true);
    expect(plan.nodesRequiringCache).toContain('n1');
  });

  it('should succeed when dependency is locked with cachedOutput', () => {
    const nodes = [
      makeNode('n1', 'generate', {
        cachedOutput: 'locked-output',
        isLocked: true,
      }),
      makeNode('n2'),
    ];
    const edges = [makeEdge('n1', 'n2')];
    const cache = new Map<string, unknown>();

    const plan = planPartialExecution(['n2'], nodes, edges, cache);

    expect(plan.isValid).toBe(true);
    expect(plan.nodesRequiringCache).toContain('n1');
  });

  it('should produce topological execution order for selected nodes', () => {
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')];
    const cache = new Map<string, unknown>();

    const plan = planPartialExecution(['A', 'B', 'C'], nodes, edges, cache);

    expect(plan.isValid).toBe(true);
    expect(plan.executionOrder).toEqual(['A', 'B', 'C']);
  });

  it('should handle selecting multiple independent nodes', () => {
    const nodes = [makeNode('n1'), makeNode('n2'), makeNode('n3')];
    const edges: ExecutableEdge[] = [];
    const cache = new Map<string, unknown>();

    const plan = planPartialExecution(['n1', 'n3'], nodes, edges, cache);

    expect(plan.isValid).toBe(true);
    expect(plan.nodesToExecute).toEqual(['n1', 'n3']);
  });
});

describe('canExecuteNode', () => {
  it('should return true for node with no dependencies', () => {
    const nodes = [makeNode('n1')];
    const edges: ExecutableEdge[] = [];
    const completed = new Set<string>();
    const cache = new Map<string, unknown>();

    expect(canExecuteNode('n1', nodes, edges, completed, cache)).toBe(true);
  });

  it('should return true when all dependencies are completed', () => {
    const nodes = [makeNode('n1'), makeNode('n2')];
    const edges = [makeEdge('n1', 'n2')];
    const completed = new Set(['n1']);
    const cache = new Map<string, unknown>();

    expect(canExecuteNode('n2', nodes, edges, completed, cache)).toBe(true);
  });

  it('should return false when dependencies are not completed', () => {
    const nodes = [makeNode('n1'), makeNode('n2')];
    const edges = [makeEdge('n1', 'n2')];
    const completed = new Set<string>();
    const cache = new Map<string, unknown>();

    expect(canExecuteNode('n2', nodes, edges, completed, cache)).toBe(false);
  });

  it('should return true when dependency is cached', () => {
    const nodes = [makeNode('n1'), makeNode('n2')];
    const edges = [makeEdge('n1', 'n2')];
    const completed = new Set<string>();
    const cache = new Map<string, unknown>([['n1', 'output']]);

    expect(canExecuteNode('n2', nodes, edges, completed, cache)).toBe(true);
  });

  it('should return true when dependency is locked with cached output', () => {
    const nodes = [
      makeNode('n1', 'generate', {
        cachedOutput: 'locked-data',
        isLocked: true,
      }),
      makeNode('n2'),
    ];
    const edges = [makeEdge('n1', 'n2')];
    const completed = new Set<string>();
    const cache = new Map<string, unknown>();

    expect(canExecuteNode('n2', nodes, edges, completed, cache)).toBe(true);
  });

  it('should return false for non-existent node', () => {
    const nodes = [makeNode('n1')];
    const edges: ExecutableEdge[] = [];
    const completed = new Set<string>();
    const cache = new Map<string, unknown>();

    expect(canExecuteNode('nonexistent', nodes, edges, completed, cache)).toBe(
      false,
    );
  });

  it('should return false when dependency node does not exist', () => {
    const nodes = [makeNode('n2')];
    const edges = [makeEdge('n1', 'n2')]; // n1 not in nodes
    const completed = new Set<string>();
    const cache = new Map<string, unknown>();

    expect(canExecuteNode('n2', nodes, edges, completed, cache)).toBe(false);
  });
});

describe('analyzeForResume', () => {
  it('should not allow resuming a completed run', () => {
    const previousRun = {
      completedAt: new Date(),
      creditsUsed: 0,
      executedNodeIds: ['n1'],
      nodeResults: [
        {
          completedAt: new Date(),
          creditsUsed: 0,
          nodeId: 'n1',
          output: 'ok',
          retryCount: 0,
          startedAt: new Date(),
          status: 'completed' as const,
        },
      ],
      runId: 'run-1',
      startedAt: new Date(),
      status: 'completed' as const,
    };

    const result = analyzeForResume(previousRun, [makeNode('n1')], []);

    expect(result.canResume).toBe(false);
    expect(result.reason).toContain('completed');
  });

  it('should not allow resuming when no failed node id', () => {
    const previousRun = {
      completedAt: new Date(),
      creditsUsed: 0,
      executedNodeIds: ['n1'],
      nodeResults: [],
      runId: 'run-1',
      startedAt: new Date(),
      status: 'failed' as const,
    };

    const result = analyzeForResume(previousRun, [makeNode('n1')], []);

    expect(result.canResume).toBe(false);
    expect(result.reason).toContain('no failed node');
  });

  it('should not allow resuming when failed node no longer exists', () => {
    const previousRun = {
      completedAt: new Date(),
      creditsUsed: 0,
      executedNodeIds: ['n1', 'n2'],
      failedNodeId: 'n2',
      nodeResults: [
        {
          completedAt: new Date(),
          creditsUsed: 0,
          nodeId: 'n1',
          output: 'data',
          retryCount: 0,
          startedAt: new Date(),
          status: 'completed' as const,
        },
      ],
      runId: 'run-1',
      startedAt: new Date(),
      status: 'failed' as const,
    };

    // n2 is no longer in the workflow
    const result = analyzeForResume(previousRun, [makeNode('n1')], []);

    expect(result.canResume).toBe(false);
    expect(result.reason).toContain('no longer exists');
  });

  it('should allow resuming a valid failed run', () => {
    const previousRun = {
      completedAt: new Date(),
      creditsUsed: 10,
      executedNodeIds: ['n1', 'n2'],
      failedNodeId: 'n2',
      nodeResults: [
        {
          completedAt: new Date(),
          creditsUsed: 10,
          nodeId: 'n1',
          output: 'image-data',
          retryCount: 0,
          startedAt: new Date(),
          status: 'completed' as const,
        },
        {
          completedAt: new Date(),
          creditsUsed: 0,
          error: 'timeout',
          nodeId: 'n2',
          retryCount: 3,
          startedAt: new Date(),
          status: 'failed' as const,
        },
      ],
      runId: 'run-1',
      startedAt: new Date(),
      status: 'failed' as const,
    };

    const nodes = [makeNode('n1'), makeNode('n2')];
    const edges = [makeEdge('n1', 'n2')];

    const result = analyzeForResume(previousRun, nodes, edges);

    expect(result.canResume).toBe(true);
    expect(result.resumeFromNodeId).toBe('n2');
    expect(result.completedNodeIds).toContain('n1');
    expect(result.nodesToReExecute).toContain('n2');
    expect(result.previousOutputs.get('n1')).toBe('image-data');
  });

  it('should include downstream nodes in re-execution list', () => {
    const previousRun = {
      completedAt: new Date(),
      creditsUsed: 10,
      executedNodeIds: ['n1', 'n2'],
      failedNodeId: 'n2',
      nodeResults: [
        {
          completedAt: new Date(),
          creditsUsed: 10,
          nodeId: 'n1',
          output: 'data',
          retryCount: 0,
          startedAt: new Date(),
          status: 'completed' as const,
        },
      ],
      runId: 'run-1',
      startedAt: new Date(),
      status: 'failed' as const,
    };

    // n1 → n2 → n3
    const nodes = [makeNode('n1'), makeNode('n2'), makeNode('n3')];
    const edges = [makeEdge('n1', 'n2'), makeEdge('n2', 'n3')];

    const result = analyzeForResume(previousRun, nodes, edges);

    expect(result.nodesToReExecute).toContain('n2');
    expect(result.nodesToReExecute).toContain('n3');
    expect(result.nodesToReExecute).not.toContain('n1');
  });
});

describe('createCacheFromRun', () => {
  it('should extract completed node outputs', () => {
    const run = {
      completedAt: new Date(),
      creditsUsed: 0,
      executedNodeIds: ['n1', 'n2'],
      nodeResults: [
        {
          completedAt: new Date(),
          creditsUsed: 0,
          nodeId: 'n1',
          output: 'output-1',
          retryCount: 0,
          startedAt: new Date(),
          status: 'completed' as const,
        },
        {
          completedAt: new Date(),
          creditsUsed: 0,
          error: 'fail',
          nodeId: 'n2',
          retryCount: 0,
          startedAt: new Date(),
          status: 'failed' as const,
        },
      ],
      runId: 'run-1',
      startedAt: new Date(),
      status: 'failed' as const,
    };

    const cache = createCacheFromRun(run);

    expect(cache.get('n1')).toBe('output-1');
    expect(cache.has('n2')).toBe(false);
  });

  it('should ignore results without output', () => {
    const run = {
      completedAt: new Date(),
      creditsUsed: 0,
      executedNodeIds: ['n1'],
      nodeResults: [
        {
          completedAt: new Date(),
          creditsUsed: 0,
          nodeId: 'n1',
          retryCount: 0,
          startedAt: new Date(),
          status: 'completed' as const,
        },
      ],
      runId: 'run-1',
      startedAt: new Date(),
      status: 'completed' as const,
    };

    const cache = createCacheFromRun(run);

    expect(cache.has('n1')).toBe(false);
  });
});

describe('mergeExecutionResults', () => {
  it('should merge current results over previous results', () => {
    const previousRun = {
      completedAt: new Date(),
      creditsUsed: 10,
      executedNodeIds: ['n1', 'n2'],
      nodeResults: [
        {
          completedAt: new Date(),
          creditsUsed: 10,
          nodeId: 'n1',
          output: 'old-output',
          retryCount: 0,
          startedAt: new Date(),
          status: 'completed' as const,
        },
        {
          completedAt: new Date(),
          creditsUsed: 0,
          error: 'failed',
          nodeId: 'n2',
          retryCount: 0,
          startedAt: new Date(),
          status: 'failed' as const,
        },
      ],
      runId: 'run-1',
      startedAt: new Date(),
      status: 'failed' as const,
    };

    const currentResults = [
      {
        completedAt: new Date(),
        creditsUsed: 5,
        nodeId: 'n2',
        output: 'new-output',
        retryCount: 1,
        startedAt: new Date(),
        status: 'completed' as const,
      },
    ];

    const merged = mergeExecutionResults(previousRun, currentResults);

    expect(merged).toHaveLength(2);
    const n2Result = merged.find((r) => r.nodeId === 'n2');
    expect(n2Result?.status).toBe('completed');
    expect(n2Result?.output).toBe('new-output');
  });
});

describe('isRetryableError', () => {
  it('should retry network errors', () => {
    expect(isRetryableError(new Error('network timeout'))).toBe(true);
  });

  it('should retry 429 rate limit errors', () => {
    expect(isRetryableError(new Error('429 Too Many Requests'))).toBe(true);
  });

  it('should retry 503 service unavailable', () => {
    expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
  });

  it('should not retry validation errors', () => {
    expect(isRetryableError(new Error('validation failed'))).toBe(false);
  });

  it('should not retry unauthorized errors', () => {
    expect(isRetryableError(new Error('unauthorized'))).toBe(false);
  });

  it('should not retry not found errors', () => {
    expect(isRetryableError(new Error('not found'))).toBe(false);
  });

  it('should retry non-Error values', () => {
    expect(isRetryableError('string error')).toBe(true);
  });

  it('should retry unknown errors by default', () => {
    expect(isRetryableError(new Error('something unexpected'))).toBe(true);
  });
});

describe('calculateRetryDelay', () => {
  it('should increase delay with attempt number', () => {
    const delay0 = calculateRetryDelay(0, {
      ...DEFAULT_RETRY_CONFIG,
      baseDelayMs: 1000,
    });
    const delay1 = calculateRetryDelay(1, {
      ...DEFAULT_RETRY_CONFIG,
      baseDelayMs: 1000,
    });
    const delay2 = calculateRetryDelay(2, {
      ...DEFAULT_RETRY_CONFIG,
      baseDelayMs: 1000,
    });

    // With backoff multiplier of 2:
    // delay0 ≈ 1000 + jitter
    // delay1 ≈ 2000 + jitter
    // delay2 ≈ 4000 + jitter
    expect(delay1).toBeGreaterThan(delay0);
    expect(delay2).toBeGreaterThan(delay1);
  });

  it('should not exceed maxDelayMs', () => {
    const delay = calculateRetryDelay(10, {
      backoffMultiplier: 2,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      maxRetries: 10,
    });

    expect(delay).toBeLessThanOrEqual(5000);
  });

  it('should include jitter', () => {
    // Run multiple times and check that not all delays are identical
    const delays = new Set<number>();
    for (let i = 0; i < 10; i++) {
      delays.add(calculateRetryDelay(0, DEFAULT_RETRY_CONFIG));
    }

    // With random jitter, we should get at least 2 distinct values in 10 tries
    expect(delays.size).toBeGreaterThanOrEqual(2);
  });
});
