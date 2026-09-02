import type { WorkflowNode } from '@genfeedai/contracts/types';
import { DEFAULT_VIDEO_DURATION, PRICING } from '@genfeedai/pricing';
import { describe, expect, it } from 'vitest';
import { calculateWorkflowCost, formatCost } from './costCalculator';

function makeNode(
  type: string,
  data: Record<string, unknown> = {},
  id = 'node-1',
): WorkflowNode {
  return {
    data,
    id,
    position: { x: 0, y: 0 },
    type,
  } as WorkflowNode;
}

describe('calculateWorkflowCost', () => {
  it('returns an empty breakdown for no nodes', () => {
    const result = calculateWorkflowCost([]);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('ignores nodes with no priced type', () => {
    const result = calculateWorkflowCost([makeNode('prompt')]);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  describe('image generation', () => {
    it('prices a flat-rate image model', () => {
      const result = calculateWorkflowCost([
        makeNode('imageGen', { model: 'nano-banana' }),
      ]);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].subtotal).toBe(PRICING['nano-banana']);
      expect(result.items[0].unit).toBe('per image');
    });

    it('prices a resolution-tiered image model', () => {
      const result = calculateWorkflowCost([
        makeNode('imageGen', { model: 'nano-banana-pro', resolution: '4K' }),
      ]);
      expect(result.items[0].subtotal).toBe(PRICING['nano-banana-pro']['4K']);
    });

    it('falls back to the first tier for unknown resolutions', () => {
      const result = calculateWorkflowCost([
        makeNode('imageGen', { model: 'nano-banana-pro', resolution: '8K' }),
      ]);
      expect(result.items[0].subtotal).toBe(
        Object.values(PRICING['nano-banana-pro'])[0],
      );
    });

    it('prices unknown image models at 0', () => {
      const result = calculateWorkflowCost([
        makeNode('imageGen', { model: 'unknown-model' }),
      ]);
      expect(result.items[0].subtotal).toBe(0);
    });

    it('defaults to nano-banana when no model is set', () => {
      const result = calculateWorkflowCost([makeNode('image-gen')]);
      expect(result.items[0].model).toBe('nano-banana');
      expect(result.items[0].subtotal).toBe(PRICING['nano-banana']);
    });

    it('uses the node label when present', () => {
      const result = calculateWorkflowCost([
        makeNode('imageGen', { label: 'Hero Image' }),
      ]);
      expect(result.items[0].nodeLabel).toBe('Hero Image');
    });
  });

  describe('video generation', () => {
    it('prices per second with audio by default', () => {
      const result = calculateWorkflowCost([
        makeNode('videoGen', { duration: 4, model: 'veo-3.1-fast' }),
      ]);
      expect(result.items[0].subtotal).toBeCloseTo(
        PRICING['veo-3.1-fast'].withAudio * 4,
        6,
      );
      expect(result.items[0].withAudio).toBe(true);
    });

    it('prices without audio when generateAudio is false', () => {
      const result = calculateWorkflowCost([
        makeNode('videoGen', {
          duration: 4,
          generateAudio: false,
          model: 'veo-3.1-fast',
        }),
      ]);
      expect(result.items[0].subtotal).toBeCloseTo(
        PRICING['veo-3.1-fast'].withoutAudio * 4,
        6,
      );
    });

    it('defaults the duration', () => {
      const result = calculateWorkflowCost([makeNode('video-gen')]);
      expect(result.items[0].quantity).toBe(DEFAULT_VIDEO_DURATION);
    });

    it('prices unknown video models at 0', () => {
      const result = calculateWorkflowCost([
        makeNode('videoGen', { model: 'mystery' }),
      ]);
      expect(result.items[0].subtotal).toBe(0);
    });
  });

  describe('luma reframe', () => {
    it('prices image reframe by model', () => {
      const result = calculateWorkflowCost([
        makeNode('reframe', { inputType: 'image', model: 'photon-1' }),
      ]);
      expect(result.items[0].subtotal).toBe(
        PRICING['luma-reframe-image']['photon-1'],
      );
      expect(result.items[0].unit).toBe('per image');
    });

    it('falls back to 0.01 for unknown image models', () => {
      const result = calculateWorkflowCost([
        makeNode('reframe', { inputType: 'image', model: 'nope' }),
      ]);
      expect(result.items[0].subtotal).toBe(0.01);
    });

    it('prices video reframe per default duration', () => {
      const result = calculateWorkflowCost([
        makeNode('lumaReframeVideo', { inputType: 'video' }),
      ]);
      expect(result.items[0].subtotal).toBeCloseTo(
        PRICING['luma-reframe-video'] * DEFAULT_VIDEO_DURATION,
        6,
      );
      expect(result.items[0].unit).toBe('per video');
    });
  });

  describe('topaz upscale', () => {
    it('prices image upscale at the ~1MP tier', () => {
      const result = calculateWorkflowCost([makeNode('upscale')]);
      expect(result.items[0].subtotal).toBe(
        PRICING['topaz-image-upscale'][0].price,
      );
    });

    it('prices video upscale by resolution/fps chunks', () => {
      const result = calculateWorkflowCost([
        makeNode('topazVideoUpscale', {
          inputType: 'video',
          targetFps: 30,
          targetResolution: '1080p',
        }),
      ]);
      const chunks = Math.ceil(DEFAULT_VIDEO_DURATION / 5);
      expect(result.items[0].quantity).toBe(chunks);
      expect(result.items[0].subtotal).toBeCloseTo(
        PRICING['topaz-video-upscale']['1080p-30'] * chunks,
        6,
      );
    });

    it('falls back to a default chunk price for unknown tiers', () => {
      const result = calculateWorkflowCost([
        makeNode('topazVideoUpscale', {
          inputType: 'video',
          targetFps: 999,
          targetResolution: '8k',
        }),
      ]);
      const chunks = Math.ceil(DEFAULT_VIDEO_DURATION / 5);
      expect(result.items[0].unitPrice).toBe(0.101);
      expect(result.items[0].subtotal).toBeCloseTo(0.101 * chunks, 6);
    });
  });

  describe('llm', () => {
    it('estimates tokens at 3x maxTokens', () => {
      const result = calculateWorkflowCost([
        makeNode('llm', { maxTokens: 1000 }),
      ]);
      expect(result.items[0].quantity).toBe(3000);
      expect(result.items[0].subtotal).toBeCloseTo(3000 * PRICING.llama, 10);
    });

    it('defaults maxTokens to 1024', () => {
      const result = calculateWorkflowCost([makeNode('llm')]);
      expect(result.items[0].quantity).toBe(1024 * 3);
    });
  });

  it('totals across multiple nodes', () => {
    const result = calculateWorkflowCost([
      makeNode('imageGen', { model: 'nano-banana' }, 'a'),
      makeNode('videoGen', { duration: 2, model: 'veo-3.1-fast' }, 'b'),
    ]);
    expect(result.items).toHaveLength(2);
    expect(result.total).toBeCloseTo(
      PRICING['nano-banana'] + PRICING['veo-3.1-fast'].withAudio * 2,
      6,
    );
  });
});

describe('formatCost', () => {
  it('formats zero', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('formats sub-cent amounts with 4 decimals', () => {
    expect(formatCost(0.0042)).toBe('$0.0042');
  });

  it('formats regular amounts with 2 decimals', () => {
    expect(formatCost(1.5)).toBe('$1.50');
  });
});
