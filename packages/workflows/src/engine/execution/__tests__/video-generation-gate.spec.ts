import { describe, expect, it, vi } from 'vitest';
import { VIDEO_GENERATION_GATE_HALT_PREFIX } from '../../services/video-generation-gate.service';
import type { ExecutableNode, ExecutableWorkflow } from '../../types';
import {
  DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
  type VideoGenerationLineage,
} from '../../video-generation-lineage';
import { type NodeExecutor, WorkflowEngine } from '../engine';

function makeNode(
  id: string,
  type: string,
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

function makeWorkflow(nodes: ExecutableNode[]): ExecutableWorkflow {
  return {
    edges: [],
    id: 'wf-1',
    lockedNodeIds: [],
    nodes,
    organizationId: 'org-1',
    userId: 'user-1',
  };
}

const zeroRetry = {
  backoffMultiplier: 1,
  baseDelayMs: 0,
  maxDelayMs: 0,
  maxRetries: 0,
};

describe('WorkflowEngine video generation gate', () => {
  it('does not change executeNode for non-video types when the gate is enabled', async () => {
    const executor: NodeExecutor = vi.fn().mockResolvedValue({ result: 'ok' });
    const engine = new WorkflowEngine({
      creditCosts: { generate: 10 },
      retryConfig: zeroRetry,
    });
    engine.registerExecutor('generate', executor);

    const result = await engine.execute(
      makeWorkflow([makeNode('n1', 'generate')]),
    );

    expect(executor).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('completed');
    expect(result.totalCreditsUsed).toBe(10);
    expect(result.nodeResults.get('n1')?.output).toEqual({ result: 'ok' });
    expect(
      result.nodeResults.get('n1')?.videoGenerationLineage,
    ).toBeUndefined();
  });

  it('behaves exactly as today when the gate is disabled', async () => {
    const executor: NodeExecutor = vi
      .fn()
      .mockResolvedValue({ video: 'full.mp4' });
    const engine = new WorkflowEngine({
      creditCosts: { videoGen: 10 },
      retryConfig: zeroRetry,
      videoGenerationGate: {
        ...DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
        isEnabled: false,
      },
    });
    engine.registerExecutor('videoGen', executor);

    const result = await engine.execute(
      makeWorkflow([
        makeNode('v1', 'videoGen', {
          config: { duration: 8, prompt: 'a presenter walking' },
        }),
      ]),
    );

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ duration: 8 }),
        type: 'videoGen',
      }),
      expect.any(Map),
      expect.any(Object),
    );
    expect(result.status).toBe('completed');
    expect(result.totalCreditsUsed).toBe(10);
    expect(result.nodeResults.get('v1')?.output).toEqual({ video: 'full.mp4' });
    expect(
      result.nodeResults.get('v1')?.videoGenerationLineage,
    ).toBeUndefined();
  });

  it('behaves exactly as today when requested duration is at the provider minimum', async () => {
    const executor: NodeExecutor = vi
      .fn()
      .mockResolvedValue({ video: 'full.mp4' });
    const engine = new WorkflowEngine({
      creditCosts: { videoGen: 10 },
      retryConfig: zeroRetry,
    });
    engine.registerExecutor('videoGen', executor);

    const result = await engine.execute(
      makeWorkflow([makeNode('v1', 'videoGen', { config: { duration: 4 } })]),
    );

    expect(executor).toHaveBeenCalledTimes(1);
    expect(result.totalCreditsUsed).toBe(10);
    expect(
      result.nodeResults.get('v1')?.videoGenerationLineage,
    ).toBeUndefined();
  });

  it('charges only the pilot until videoQa accepts, then charges the full run', async () => {
    const executor: NodeExecutor = vi
      .fn()
      .mockResolvedValueOnce({ video: 'pilot.mp4' })
      .mockResolvedValueOnce({ video: 'full.mp4' });
    const engine = new WorkflowEngine({
      creditCosts: { videoGen: 10 },
      retryConfig: zeroRetry,
    });
    engine.registerExecutor('videoGen', executor);

    const result = await engine.execute(
      makeWorkflow([
        makeNode('v1', 'videoGen', {
          config: { duration: 8, model: 'veo-3.1-fast', seed: 3 },
        }),
      ]),
      {
        evaluateVideoPilot: async () => ({
          passed: true,
          source: 'videoQa',
        }),
      },
    );

    expect(executor).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('completed');
    expect(result.totalCreditsUsed).toBe(15);
    expect(result.nodeResults.get('v1')?.output).toEqual({ video: 'full.mp4' });
  });

  it('halts after three rejected paid candidates with a structured summary and no fourth provider call', async () => {
    const executor: NodeExecutor = vi
      .fn()
      .mockResolvedValue({ video: 'bad.mp4' });
    const engine = new WorkflowEngine({
      creditCosts: { videoGen: 10 },
      retryConfig: zeroRetry,
    });
    engine.registerExecutor('videoGen', executor);

    let lineage: VideoGenerationLineage | undefined;

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const result = await engine.execute(
        makeWorkflow([makeNode('v1', 'videoGen', { config: { duration: 8 } })]),
        {
          evaluateVideoPilot: async () => ({
            failures: [
              {
                code: 'BLACK_FRAMES',
                message: 'opening second is black',
                timestamp: 0,
              },
            ],
            passed: false,
            source: 'videoQa',
          }),
          videoGenerationLineage: lineage,
        },
      );

      lineage = result.nodeResults.get('v1')?.videoGenerationLineage;
      expect(lineage).toBeDefined();

      if (attempt < 4) {
        expect(result.status).toBe('failed');
        expect(executor).toHaveBeenCalledTimes(attempt);
      } else {
        expect(result.status).toBe('failed');
        expect(result.error).toContain(VIDEO_GENERATION_GATE_HALT_PREFIX);
        expect(executor).toHaveBeenCalledTimes(3);
      }
    }
  });
});
