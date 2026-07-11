import type { ExecutionContext } from '@workflow-engine/execution/engine';
import {
  buildFfmpegFilterChain,
  COLOR_GRADE_PRESETS,
  createColorGradeExecutor,
} from '@workflow-engine/executors/saas/color-grade-executor';
import { describe, expect, it, vi } from 'vitest';

const ctx: ExecutionContext = {
  organizationId: 'o',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};

describe('buildFfmpegFilterChain', () => {
  it('builds basic eq filter', () => {
    const chain = buildFfmpegFilterChain({
      contrast: 50,
      grain: 0,
      saturation: 50,
      sharpness: 0,
      vignette: 0,
      warmth: 50,
    });
    expect(chain).toContain('eq=');
  });
  it('includes vignette when > 0', () => {
    expect(
      buildFfmpegFilterChain({
        contrast: 50,
        grain: 0,
        saturation: 50,
        sharpness: 0,
        vignette: 50,
        warmth: 50,
      }),
    ).toContain('vignette');
  });
  it('includes grain when > 0', () => {
    expect(
      buildFfmpegFilterChain({
        contrast: 50,
        grain: 50,
        saturation: 50,
        sharpness: 0,
        vignette: 0,
        warmth: 50,
      }),
    ).toContain('noise');
  });
  it('includes sharpness when > 0', () => {
    expect(
      buildFfmpegFilterChain({
        contrast: 50,
        grain: 0,
        saturation: 50,
        sharpness: 50,
        vignette: 0,
        warmth: 50,
      }),
    ).toContain('unsharp');
  });
  it('includes colorbalance for warm warmth', () => {
    expect(
      buildFfmpegFilterChain({
        contrast: 50,
        grain: 0,
        saturation: 50,
        sharpness: 0,
        vignette: 0,
        warmth: 80,
      }),
    ).toContain('colorbalance');
  });
});

describe('COLOR_GRADE_PRESETS', () => {
  it('has all presets', () => {
    expect(Object.keys(COLOR_GRADE_PRESETS)).toContain('instagram-warm');
    expect(Object.keys(COLOR_GRADE_PRESETS)).toContain('custom');
  });
});

describe('ColorGradeExecutor', () => {
  describe('validate', () => {
    it('valid defaults', () => {
      expect(
        createColorGradeExecutor().validate({
          config: {},
          id: '1',
          inputs: [],
          label: 'CG',
          type: 'colorGrade',
        }).valid,
      ).toBe(true);
    });
    it('invalid mode', () => {
      expect(
        createColorGradeExecutor().validate({
          config: { mode: 'magic' },
          id: '1',
          inputs: [],
          label: 'CG',
          type: 'colorGrade',
        }).valid,
      ).toBe(false);
    });
    it('invalid preset', () => {
      expect(
        createColorGradeExecutor().validate({
          config: { preset: 'fantasy' },
          id: '1',
          inputs: [],
          label: 'CG',
          type: 'colorGrade',
        }).valid,
      ).toBe(false);
    });
    it('invalid numeric field', () => {
      expect(
        createColorGradeExecutor().validate({
          config: { warmth: 150 },
          id: '1',
          inputs: [],
          label: 'CG',
          type: 'colorGrade',
        }).valid,
      ).toBe(false);
    });
    it('requires style ref for ai-style', () => {
      expect(
        createColorGradeExecutor().validate({
          config: { mode: 'ai-style' },
          id: '1',
          inputs: [],
          label: 'CG',
          type: 'colorGrade',
        }).valid,
      ).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('5 for ai-style', () => {
      expect(
        createColorGradeExecutor().estimateCost({
          config: { mode: 'ai-style' },
          id: '1',
          inputs: [],
          label: 'CG',
          type: 'colorGrade',
        }),
      ).toBe(5);
    });
    it('0 for preset', () => {
      expect(
        createColorGradeExecutor().estimateCost({
          config: { mode: 'preset' },
          id: '1',
          inputs: [],
          label: 'CG',
          type: 'colorGrade',
        }),
      ).toBe(0);
    });
  });

  describe('execute', () => {
    it('throws without processor', async () => {
      await expect(
        createColorGradeExecutor().execute({
          context: ctx,
          inputs: new Map<string, unknown>([['imageUrl', 'http://i.png']]),
          node: {
            config: {},
            id: '1',
            inputs: [],
            label: 'CG',
            type: 'colorGrade',
          },
        }),
      ).rejects.toThrow('processor');
    });

    it('processes image', async () => {
      const processor = vi
        .fn()
        .mockResolvedValue({ jobId: 'j', outputImageUrl: 'http://out.png' });
      const exec = createColorGradeExecutor(processor);
      const result = await exec.execute({
        context: ctx,
        inputs: new Map<string, unknown>([['imageUrl', 'http://i.png']]),
        node: {
          config: {},
          id: '1',
          inputs: [],
          label: 'CG',
          type: 'colorGrade',
        },
      });
      expect(result.data).toBe('http://out.png');
      expect(result.metadata?.mode).toBe('preset');
    });
  });
});
