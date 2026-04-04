import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  buildCinematicColorGradeFilterChain,
  CAMERA_PROFILE_CURVES,
  type CinematicColorGradeConfig,
  CinematicColorGradeExecutor,
  type CinematicColorGradeProcessor,
  createCinematicColorGradeExecutor,
} from '@workflow-engine/executors/saas/cinematic-color-grade-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(
  config: Record<string, unknown>,
  videoUrl = 'https://example.com/video.mp4',
): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'cg-1',
    inputs: [],
    label: 'Cinematic Color Grade',
    type: 'cinematicColorGrade',
  };
  const inputs = new Map<string, unknown>();
  inputs.set('videoUrl', videoUrl);
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs, node };
}

describe('buildCinematicColorGradeFilterChain', () => {
  it('includes camera profile curves', () => {
    const config: CinematicColorGradeConfig = {
      cameraProfile: 'arri_logc4',
      contrast: 0,
      highlights: 0,
      lutIntensity: 0,
      midtones: 0,
      saturation: 0,
      shadows: 0,
      temperature: 6500,
    };
    const chain = buildCinematicColorGradeFilterChain(config);
    expect(chain).toContain(CAMERA_PROFILE_CURVES.arri_logc4);
  });

  it('includes colorbalance filter', () => {
    const config: CinematicColorGradeConfig = {
      cameraProfile: 'red_ippc2',
      contrast: 10,
      highlights: 5,
      lutIntensity: 0,
      midtones: -10,
      saturation: -10,
      shadows: 20,
      temperature: 5000,
    };
    const chain = buildCinematicColorGradeFilterChain(config);
    expect(chain).toContain('colorbalance=');
    expect(chain).toContain('eq=contrast=');
  });

  it('adds LUT blend when customLUT is provided', () => {
    const config: CinematicColorGradeConfig = {
      cameraProfile: 'sony_slog3',
      contrast: 0,
      customLUT: '/path/to/lut.cube',
      highlights: 0,
      lutIntensity: 75,
      midtones: 0,
      saturation: 0,
      shadows: 0,
      temperature: 6500,
    };
    const chain = buildCinematicColorGradeFilterChain(config);
    expect(chain).toContain('lut3d=');
    expect(chain).toContain('blend=all_mode=normal:all_opacity=0.75');
  });

  it('skips LUT when lutIntensity is 0', () => {
    const config: CinematicColorGradeConfig = {
      cameraProfile: 'arri_logc4',
      contrast: 0,
      customLUT: '/path/to/lut.cube',
      highlights: 0,
      lutIntensity: 0,
      midtones: 0,
      saturation: 0,
      shadows: 0,
      temperature: 6500,
    };
    const chain = buildCinematicColorGradeFilterChain(config);
    expect(chain).not.toContain('lut3d');
  });

  it('maps temperature to warm/cool shifts', () => {
    const warm: CinematicColorGradeConfig = {
      cameraProfile: 'arri_logc4',
      contrast: 0,
      highlights: 0,
      lutIntensity: 0,
      midtones: 0,
      saturation: 0,
      shadows: 0,
      temperature: 9000,
    };
    const cool: CinematicColorGradeConfig = {
      ...warm,
      temperature: 3000,
    };
    const warmChain = buildCinematicColorGradeFilterChain(warm);
    const coolChain = buildCinematicColorGradeFilterChain(cool);
    // Warm should have positive rs, cool should have negative
    expect(warmChain).not.toBe(coolChain);
  });
});

describe('CinematicColorGradeExecutor', () => {
  let executor: CinematicColorGradeExecutor;
  let mockProcessor: CinematicColorGradeProcessor;

  beforeEach(() => {
    mockProcessor = vi.fn().mockResolvedValue({
      jobId: 'job-123',
      outputVideoUrl: 'https://cdn.example.com/graded.mp4',
    });
    executor = createCinematicColorGradeExecutor(mockProcessor);
  });

  describe('validate', () => {
    it('passes with valid config', () => {
      const result = executor.validate({
        config: {
          cameraProfile: 'arri_logc4',
          contrast: 10,
          saturation: -10,
          temperature: 5500,
        },
        id: 'cg-1',
        inputs: [],
        label: 'CG',
        type: 'cinematicColorGrade',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects invalid camera profile', () => {
      const result = executor.validate({
        config: { cameraProfile: 'nikon_nlog' },
        id: 'cg-1',
        inputs: [],
        label: 'CG',
        type: 'cinematicColorGrade',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('cameraProfile');
    });

    it('rejects out-of-range contrast', () => {
      const result = executor.validate({
        config: { contrast: 200 },
        id: 'cg-1',
        inputs: [],
        label: 'CG',
        type: 'cinematicColorGrade',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('contrast');
    });

    it('rejects out-of-range temperature', () => {
      const result = executor.validate({
        config: { temperature: 500 },
        id: 'cg-1',
        inputs: [],
        label: 'CG',
        type: 'cinematicColorGrade',
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('execute', () => {
    it('calls processor with filter chain', async () => {
      const input = makeInput({ cameraProfile: 'red_ippc2', contrast: 20 });
      const result = await executor.execute(input);
      expect(mockProcessor).toHaveBeenCalledOnce();
      expect(result.data).toBe('https://cdn.example.com/graded.mp4');
      expect(result.metadata?.filterChain).toBeTruthy();
      expect(result.metadata?.cameraProfile).toBe('red_ippc2');
    });

    it('throws when processor not configured', async () => {
      const bare = createCinematicColorGradeExecutor();
      const input = makeInput({});
      await expect(bare.execute(input)).rejects.toThrow(
        'processor not configured',
      );
    });

    it('throws when videoUrl input is missing', async () => {
      const node: ExecutableNode = {
        config: {},
        id: 'cg-1',
        inputs: [],
        label: 'CG',
        type: 'cinematicColorGrade',
      };
      const input: ExecutorInput = {
        context: {
          organizationId: 'org-1',
          runId: 'run-1',
          userId: 'user-1',
          workflowId: 'wf-1',
        },
        inputs: new Map(),
        node,
      };
      await expect(executor.execute(input)).rejects.toThrow('videoUrl');
    });
  });

  it('estimateCost returns 2', () => {
    expect(
      executor.estimateCost({
        config: {},
        id: 'cg-1',
        inputs: [],
        label: 'CG',
        type: 'cinematicColorGrade',
      }),
    ).toBe(2);
  });
});
