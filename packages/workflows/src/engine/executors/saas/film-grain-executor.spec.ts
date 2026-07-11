import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  buildFilmGrainFilter,
  createFilmGrainExecutor,
  FilmGrainExecutor,
} from '@workflow-engine/executors/saas/film-grain-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(
  config: Record<string, unknown>,
  inputData?: Record<string, unknown>,
): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'grain-1',
    inputs: [],
    label: 'Film Grain',
    type: 'filmGrain',
  };
  const inputs = new Map<string, unknown>();
  if (inputData) {
    for (const [k, v] of Object.entries(inputData)) {
      inputs.set(k, v);
    }
  }
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs, node };
}

describe('FilmGrainExecutor', () => {
  let executor: FilmGrainExecutor;

  beforeEach(() => {
    executor = new FilmGrainExecutor();
  });

  describe('validate', () => {
    it('passes with valid config', () => {
      const input = makeInput({
        colorGrain: false,
        intensity: 50,
        size: 'medium',
        stock: '35mm_fine',
      });
      const result = executor.validate(input.node);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects invalid stock', () => {
      const input = makeInput({ stock: 'invalid' });
      const result = executor.validate(input.node);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid stock'))).toBe(true);
    });

    it('rejects intensity out of range', () => {
      const input = makeInput({ intensity: 150 });
      const result = executor.validate(input.node);
      expect(result.valid).toBe(false);
    });

    it('rejects invalid size', () => {
      const input = makeInput({ size: 'huge' });
      const result = executor.validate(input.node);
      expect(result.valid).toBe(false);
    });

    it('rejects non-boolean colorGrain', () => {
      const input = makeInput({ colorGrain: 'yes' });
      const result = executor.validate(input.node);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('colorGrain'))).toBe(true);
    });
  });

  describe('execute', () => {
    it('calls processor with filter chain', async () => {
      const processor = vi.fn().mockResolvedValue({
        jobId: 'job-123',
        outputUrl: 'https://cdn.example.com/output.mp4',
      });
      executor.setProcessor(processor);

      const input = makeInput(
        {
          colorGrain: true,
          intensity: 80,
          size: 'coarse',
          stock: '35mm_heavy',
        },
        { videoUrl: 'https://cdn.example.com/input.mp4' },
      );

      const result = await executor.execute(input);

      expect(processor).toHaveBeenCalledOnce();
      const call = processor.mock.calls[0][0];
      expect(call.videoUrl).toBe('https://cdn.example.com/input.mp4');
      expect(call.stock).toBe('35mm_heavy');
      expect(call.filterChain).toBeTruthy();
      expect(result.data).toBe('https://cdn.example.com/output.mp4');
    });

    it('throws if processor not set', async () => {
      const input = makeInput({}, { videoUrl: 'https://example.com/v.mp4' });
      await expect(executor.execute(input)).rejects.toThrow(
        'Film grain processor not configured',
      );
    });

    it('throws if videoUrl missing', async () => {
      executor.setProcessor(vi.fn());
      const input = makeInput({}, {});
      await expect(executor.execute(input)).rejects.toThrow(
        'Missing required input: videoUrl',
      );
    });
  });

  describe('estimateCost', () => {
    it('returns 0', () => {
      const input = makeInput({});
      expect(executor.estimateCost(input.node)).toBe(0);
    });
  });
});

describe('buildFilmGrainFilter', () => {
  it('generates noise filter for 35mm_fine', () => {
    const filter = buildFilmGrainFilter({
      colorGrain: false,
      intensity: 100,
      size: 'medium',
      stock: '35mm_fine',
    });
    expect(filter).toContain('noise=alls=');
    expect(filter).toContain('allf=t+u');
  });

  it('generates per-channel noise for color grain', () => {
    const filter = buildFilmGrainFilter({
      colorGrain: true,
      intensity: 100,
      size: 'medium',
      stock: '35mm_fine',
    });
    expect(filter).toContain('c0s=');
    expect(filter).toContain('c1s=');
    expect(filter).toContain('c2s=');
  });

  it('returns empty string for zero intensity', () => {
    const filter = buildFilmGrainFilter({
      colorGrain: false,
      intensity: 0,
      size: 'medium',
      stock: '35mm_fine',
    });
    expect(filter).toBe('');
  });

  it('adds tmix for 8mm stock', () => {
    const filter = buildFilmGrainFilter({
      colorGrain: false,
      intensity: 100,
      size: 'medium',
      stock: '8mm',
    });
    expect(filter).toContain('tmix');
  });

  it('does not add temporal flag for digital_noise', () => {
    const filter = buildFilmGrainFilter({
      colorGrain: false,
      intensity: 100,
      size: 'medium',
      stock: 'digital_noise',
    });
    expect(filter).not.toContain('t+u');
    expect(filter).toContain('allf=u');
  });
});

describe('createFilmGrainExecutor', () => {
  it('creates executor without processor', () => {
    const executor = createFilmGrainExecutor();
    expect(executor.nodeType).toBe('filmGrain');
  });

  it('creates executor with processor', () => {
    const processor = vi.fn();
    const executor = createFilmGrainExecutor(processor);
    expect(executor.nodeType).toBe('filmGrain');
  });
});
