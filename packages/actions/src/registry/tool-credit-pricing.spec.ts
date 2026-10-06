import {
  BATCH_CAPTION_BASE_CREDITS,
  estimateBatchGenerationCredits,
} from '@genfeedai/contracts/constants/batch-generation-pricing.constant';
import {
  BRAND_INTERVIEW_CREDIT_COST,
  CLIP_CREDIT_PER_CLIP,
  CLIP_HIGHLIGHT_COUNT_MAXIMUM,
} from '@genfeedai/contracts/constants/tool-credit.constant';
import { describe, expect, it } from 'vitest';
import {
  MCP_CREDIT_PRICING_META_KEY,
  toMcpTools,
} from '../adapters/to-mcp-tool';
import type { ToolCreditPricing } from '../interfaces/tool-definition.interface';
import { MEDIA_GENERATION_CREDIT_FLOORS } from './media-generation';
import {
  estimateToolCreditCost,
  isSpendingCreditPricing,
} from './tool-credit-pricing';
import { getToolByName, getToolsForSurface } from './tool-registry';
import { DEFAULT_MCP_PROFILE_TOOLSETS } from './toolset-profiles';
import { getToolsForToolsets } from './toolsets';

function pricingOf(name: string): ToolCreditPricing {
  const tool = getToolByName(name);
  if (!tool?.creditPricing) {
    throw new Error(`missing credit pricing for ${name}`);
  }
  return tool.creditPricing;
}

describe('tool credit pricing', () => {
  it('keeps direct non-zero spenders off the default MCP profile', () => {
    const offenders = getToolsForToolsets(
      'mcp',
      DEFAULT_MCP_PROFILE_TOOLSETS,
    ).filter((tool) => {
      const pricing = tool.creditPricing;
      return (
        tool.mutationPolicy === 'direct' &&
        pricing !== undefined &&
        (tool.creditCost > 0 ||
          isSpendingCreditPricing(pricing, tool.creditCost))
      );
    });
    expect(offenders.map((tool) => tool.name)).toEqual([]);
  });

  it('does not mark a spending tool read-only', () => {
    const offenders = getToolsForSurface('mcp').filter((tool) => {
      const pricing = tool.creditPricing;
      return (
        tool.annotations?.readOnlyHint === true &&
        pricing !== undefined &&
        isSpendingCreditPricing(pricing, tool.creditCost)
      );
    });
    expect(offenders.map((tool) => tool.name)).toEqual([]);
  });

  it('describes generate and generate_content_batch as variable ranges', () => {
    const floors = Object.values(MEDIA_GENERATION_CREDIT_FLOORS);
    const generate = getToolByName('generate');
    const batch = getToolByName('generate_content_batch');
    expect(generate?.creditPricing).toEqual({
      maximum: Math.max(...floors),
      minimum: Math.min(...floors),
      mode: 'variable',
      unit: 'generation',
    });
    if (generate?.creditPricing?.mode === 'variable') {
      expect(generate.description).toContain(
        `Variable cost: ${generate.creditPricing.minimum}–${generate.creditPricing.maximum} credits per generation.`,
      );
    }
    expect(generate?.description).toContain('per-type floor');
    expect(batch?.creditPricing?.mode).toBe('variable');
    if (batch?.creditPricing?.mode === 'variable') {
      expect(batch.creditPricing.unit).toBe('batch');
      expect(batch.creditPricing.minimum).toBeGreaterThan(0);
      expect(batch.creditPricing.maximum).toBeGreaterThan(
        batch.creditPricing.minimum,
      );
      expect(batch.description).toContain(
        `Variable cost: ${batch.creditPricing.minimum}–${batch.creditPricing.maximum} credits per batch.`,
      );
    }
    const [listed] = toMcpTools(
      [generate, batch].filter(
        (tool): tool is NonNullable<typeof tool> => tool !== undefined,
      ),
    );
    expect(listed?._meta[MCP_CREDIT_PRICING_META_KEY]).toMatchObject({
      mode: 'variable',
      unit: 'generation',
    });
  });

  it('estimates from the same helpers the debit path uses', () => {
    const generate = pricingOf('generate');
    expect(
      estimateToolCreditCost('generate', { type: 'image' }, generate),
    ).toBe(MEDIA_GENERATION_CREDIT_FLOORS.image);
    expect(
      estimateToolCreditCost(
        'generate_content_batch',
        { count: 4 },
        pricingOf('generate_content_batch'),
      ),
    ).toBe(
      estimateBatchGenerationCredits({ count: 4 }, { includeMedia: false }),
    );
    expect(
      estimateToolCreditCost(
        'repurpose_post',
        { mode: 'agent' },
        pricingOf('repurpose_post'),
      ),
    ).toBe(BATCH_CAPTION_BASE_CREDITS);
    expect(
      estimateToolCreditCost(
        'repurpose_post',
        { mode: 'deterministic' },
        pricingOf('repurpose_post'),
      ),
    ).toBe(0);
    expect(
      estimateToolCreditCost(
        'transform_media',
        { operation: 'merge' },
        pricingOf('transform_media'),
      ),
    ).toBe(0);
    expect(
      estimateToolCreditCost(
        'transform_media',
        { operation: 'edit' },
        pricingOf('transform_media'),
      ),
    ).toBe(MEDIA_GENERATION_CREDIT_FLOORS.image);
    expect(
      estimateToolCreditCost(
        'transform_media',
        {},
        pricingOf('transform_media'),
      ),
    ).toBeNull();
  });

  it('prices quotes, the interview, and clip gates from their billing constants', () => {
    expect(pricingOf('generate_visual_code')).toEqual({
      mode: 'quote',
      quoteTool: 'quote_visual_code_generation',
    });
    expect(pricingOf('start_remix_generation')).toEqual({
      mode: 'quote',
      quoteTool: 'quote_remix_generation',
    });
    expect(
      estimateToolCreditCost(
        'generate_visual_code',
        { maximumCredits: 12 },
        pricingOf('generate_visual_code'),
      ),
    ).toBe(12);
    expect(
      estimateToolCreditCost(
        'start_remix_generation',
        { runId: 'run-1' },
        pricingOf('start_remix_generation'),
      ),
    ).toBeNull();
    expect(getToolByName('start_brand_interview')).toMatchObject({
      creditCost: 0,
      creditPricing: {
        amount: BRAND_INTERVIEW_CREDIT_COST,
        mode: 'fixed',
      },
    });
    const analysis = pricingOf('analyze_clip_project');
    expect(analysis).toEqual({ amount: 0, mode: 'fixed' });
    expect(
      isSpendingCreditPricing(
        analysis,
        getToolByName('analyze_clip_project')?.creditCost ?? 0,
      ),
    ).toBe(false);
    expect(pricingOf('generate_clips')).toEqual({
      maximum: CLIP_CREDIT_PER_CLIP * CLIP_HIGHLIGHT_COUNT_MAXIMUM,
      minimum: CLIP_CREDIT_PER_CLIP,
      mode: 'variable',
      unit: 'clip',
    });
    expect(
      estimateToolCreditCost(
        'generate_clips',
        { maxClips: 8 },
        pricingOf('generate_clips'),
      ),
    ).toBe(8 * CLIP_CREDIT_PER_CLIP);
  });
});
