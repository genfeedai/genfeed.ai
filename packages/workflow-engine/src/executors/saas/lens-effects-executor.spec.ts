import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  buildLensEffectsFilterChain,
  createLensEffectsExecutor,
  type LensEffectsConfig,
  LensEffectsExecutor,
  type LensEffectsProcessor,
} from '@workflow-engine/executors/saas/lens-effects-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(
  config: Record<string, unknown>,
  videoUrl = 'https://example.com/video.mp4',
): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'le-1',
    inputs: [],
    label: 'Lens Effects',
    type: 'lensEffects',
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

const allOff: LensEffectsConfig = {
  barrelDistortion: { amount: 0, enabled: false },
  bloom: { enabled: false, intensity: 0, threshold: 80 },
  chromaticAberration: { enabled: false, intensity: 0 },
  vignette: { enabled: false, intensity: 0, softness: 50 },
};

describe('buildLensEffectsFilterChain', () => {
  it('returns null when all effects disabled', () => {
    expect(buildLensEffectsFilterChain(allOff)).toBe('null');
  });

  it('produces vignette filter', () => {
    const config: LensEffectsConfig = {
      ...allOff,
      vignette: { enabled: true, intensity: 50, softness: 60 },
    };
    const chain = buildLensEffectsFilterChain(config);
    expect(chain).toContain('vignette=');
  });

  it('produces chromatic aberration filter', () => {
    const config: LensEffectsConfig = {
      ...allOff,
      chromaticAberration: { enabled: true, intensity: 50 },
    };
    const chain = buildLensEffectsFilterChain(config);
    expect(chain).toContain('rgbashift=');
  });

  it('produces barrel distortion filter', () => {
    const config: LensEffectsConfig = {
      ...allOff,
      barrelDistortion: { amount: 30, enabled: true },
    };
    const chain = buildLensEffectsFilterChain(config);
    expect(chain).toContain('lenscorrection=');
  });

  it('produces bloom filter chain with split and blend', () => {
    const config: LensEffectsConfig = {
      ...allOff,
      bloom: { enabled: true, intensity: 50, threshold: 80 },
    };
    const chain = buildLensEffectsFilterChain(config);
    expect(chain).toContain('split[le_main][le_bloom]');
    expect(chain).toContain('gblur=');
    expect(chain).toContain('blend=all_mode=screen');
  });

  it('combines multiple effects', () => {
    const config: LensEffectsConfig = {
      barrelDistortion: { amount: -15, enabled: true },
      bloom: { enabled: true, intensity: 25, threshold: 85 },
      chromaticAberration: { enabled: true, intensity: 20 },
      vignette: { enabled: true, intensity: 30, softness: 70 },
    };
    const chain = buildLensEffectsFilterChain(config);
    expect(chain).toContain('vignette=');
    expect(chain).toContain('rgbashift=');
    expect(chain).toContain('lenscorrection=');
    expect(chain).toContain('gblur=');
  });

  it('skips vignette when intensity is 0', () => {
    const config: LensEffectsConfig = {
      ...allOff,
      vignette: { enabled: true, intensity: 0, softness: 50 },
    };
    const chain = buildLensEffectsFilterChain(config);
    expect(chain).not.toContain('vignette=');
  });
});

describe('LensEffectsExecutor', () => {
  let executor: LensEffectsExecutor;
  let mockProcessor: LensEffectsProcessor;

  beforeEach(() => {
    mockProcessor = vi.fn().mockResolvedValue({
      jobId: 'job-789',
      outputVideoUrl: 'https://cdn.example.com/lens.mp4',
    });
    executor = createLensEffectsExecutor(mockProcessor);
  });

  describe('validate', () => {
    it('passes with valid config', () => {
      const result = executor.validate({
        config: {
          bloom: { enabled: false, intensity: 0, threshold: 80 },
          vignette: { enabled: true, intensity: 50, softness: 50 },
        },
        id: 'le-1',
        inputs: [],
        label: 'LE',
        type: 'lensEffects',
      });
      expect(result.valid).toBe(true);
    });

    it('rejects out-of-range vignette intensity', () => {
      const result = executor.validate({
        config: { vignette: { intensity: 200 } },
        id: 'le-1',
        inputs: [],
        label: 'LE',
        type: 'lensEffects',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('vignette.intensity');
    });

    it('rejects out-of-range barrel distortion', () => {
      const result = executor.validate({
        config: { barrelDistortion: { amount: -200 } },
        id: 'le-1',
        inputs: [],
        label: 'LE',
        type: 'lensEffects',
      });
      expect(result.valid).toBe(false);
    });

    it('rejects non-object sub-config', () => {
      const result = executor.validate({
        config: { vignette: 'invalid' },
        id: 'le-1',
        inputs: [],
        label: 'LE',
        type: 'lensEffects',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be an object');
    });
  });

  describe('execute', () => {
    it('calls processor and returns output', async () => {
      const input = makeInput({
        vignette: { enabled: true, intensity: 40, softness: 60 },
      });
      const result = await executor.execute(input);
      expect(mockProcessor).toHaveBeenCalledOnce();
      expect(result.data).toBe('https://cdn.example.com/lens.mp4');
      expect(result.metadata?.filterChain).toBeTruthy();
    });

    it('throws without processor', async () => {
      const bare = createLensEffectsExecutor();
      await expect(bare.execute(makeInput({}))).rejects.toThrow(
        'processor not configured',
      );
    });
  });
});
