import { ContentFormat } from '@genfeedai/contracts';
import {
  BATCH_CAPTION_BASE_CREDITS,
  BATCH_GENERATION_COUNT_MAXIMUM,
  batchItemCredits,
  contentMixFromToolArguments,
  estimateBatchGenerationCredits,
} from '@genfeedai/contracts/constants/batch-generation-pricing.constant';
import {
  BRAND_INTERVIEW_CREDIT_COST,
  CLIP_CREDIT_PER_CLIP,
  CLIP_HIGHLIGHT_COUNT_MAXIMUM,
  clipCreditGateAmount,
} from '@genfeedai/contracts/constants/tool-credit.constant';
import type {
  CanonicalToolDefinition,
  ToolCreditPricing,
} from '../interfaces/tool-definition.interface';
import {
  getMediaGenerationCreditFloor,
  MEDIA_GENERATION_CREDIT_FLOORS,
  MEDIA_GENERATION_TOOL_NAME,
} from './media-generation';
import {
  getMediaTransformOperation,
  MEDIA_TRANSFORM_TOOL_NAME,
} from './media-transform';

const VISUAL_CODE_QUOTE_TOOL = 'quote_visual_code_generation';
const REMIX_QUOTE_TOOL = 'quote_remix_generation';

const QUOTE_TOOL_BY_NAME: Readonly<Record<string, string>> = {
  export_visual_code_project: VISUAL_CODE_QUOTE_TOOL,
  generate_visual_code: VISUAL_CODE_QUOTE_TOOL,
  retry_visual_code_project: VISUAL_CODE_QUOTE_TOOL,
  revise_visual_code_project: VISUAL_CODE_QUOTE_TOOL,
  start_remix_generation: REMIX_QUOTE_TOOL,
};

function floorBounds(): { maximum: number; minimum: number } {
  const floors = Object.values(MEDIA_GENERATION_CREDIT_FLOORS);
  return { maximum: Math.max(...floors), minimum: Math.min(...floors) };
}

function batchCreditRange(): { maximum: number; minimum: number } {
  const packaging = { includeMedia: false as const };
  const withMedia = {
    includeMedia: true as const,
    qualityTier: 'high_quality' as const,
  };
  let minimum = Number.POSITIVE_INFINITY;
  let itemMaximum = 0;
  for (const format of Object.values(ContentFormat)) {
    minimum = Math.min(
      minimum,
      batchItemCredits({ format, hasMedia: false }, packaging),
    );
    itemMaximum = Math.max(
      itemMaximum,
      batchItemCredits({ format, hasMedia: true }, withMedia),
    );
  }
  return {
    maximum: itemMaximum * BATCH_GENERATION_COUNT_MAXIMUM,
    minimum,
  };
}

export function fixedCreditPricing(amount: number): ToolCreditPricing {
  return { amount, mode: 'fixed' };
}

export function toolCreditPricingFor(
  name: string,
  creditCost: number,
): ToolCreditPricing {
  const quoteTool = QUOTE_TOOL_BY_NAME[name];
  if (quoteTool) return { mode: 'quote', quoteTool };
  if (name === MEDIA_GENERATION_TOOL_NAME) {
    const bounds = floorBounds();
    return { mode: 'variable', unit: 'generation', ...bounds };
  }
  if (name === 'generate_content_batch') {
    const bounds = batchCreditRange();
    return { mode: 'variable', unit: 'batch', ...bounds };
  }
  if (name === MEDIA_TRANSFORM_TOOL_NAME) {
    return {
      maximum: MEDIA_GENERATION_CREDIT_FLOORS.image,
      minimum: 0,
      mode: 'variable',
      unit: 'transform',
    };
  }
  if (name === 'repurpose_post') {
    return {
      maximum: BATCH_CAPTION_BASE_CREDITS,
      minimum: 0,
      mode: 'variable',
      unit: 'repurpose',
    };
  }
  if (
    name === 'create_clip_project_from_youtube' ||
    name === 'generate_clips'
  ) {
    return {
      maximum: clipCreditGateAmount(CLIP_HIGHLIGHT_COUNT_MAXIMUM),
      minimum: CLIP_CREDIT_PER_CLIP,
      mode: 'variable',
      unit: 'clip',
    };
  }
  if (name === 'start_brand_interview') {
    return fixedCreditPricing(BRAND_INTERVIEW_CREDIT_COST);
  }
  return fixedCreditPricing(creditCost);
}

export function isSpendingCreditPricing(
  pricing: ToolCreditPricing,
  creditCost: number,
): boolean {
  if (creditCost > 0) return true;
  if (pricing.mode === 'quote') return true;
  if (pricing.mode === 'variable') return pricing.maximum > 0;
  return pricing.amount > 0;
}

/**
 * `/mcp` confirms a spend even when the shared catalog leaves the tool
 * `direct`, so in-app auto and plan can still run that tool.
 */
export function requiresMcpApproval(
  tool:
    | Pick<
        CanonicalToolDefinition,
        'creditCost' | 'creditPricing' | 'mutationPolicy'
      >
    | undefined,
): boolean {
  if (!tool) return false;
  if (tool.mutationPolicy === 'approval-required') return true;
  const creditCost = tool.creditCost ?? 0;
  if (!tool.creditPricing) return creditCost > 0;
  return isSpendingCreditPricing(tool.creditPricing, creditCost);
}

export function describeCreditPricing(pricing: ToolCreditPricing): string {
  if (pricing.mode === 'variable') {
    return `Variable cost: ${pricing.minimum}–${pricing.maximum} credits per ${pricing.unit}.`;
  }
  if (pricing.mode === 'quote') {
    return `Cost comes from the approved ${pricing.quoteTool} quote.`;
  }
  return pricing.amount === 0
    ? 'Costs 0 credits.'
    : `Costs ${pricing.amount} credits.`;
}

export function appendCreditPricingDescription(
  description: string,
  pricing: ToolCreditPricing | undefined,
): string {
  if (!pricing || pricing.mode === 'fixed') return description;
  const sentence = describeCreditPricing(pricing);
  if (description.includes(sentence)) return description;
  return `${description} ${sentence}`;
}

function boundedCount(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return fallback;
  }
  return Math.min(value, maximum);
}

function clipCount(args: Record<string, unknown>): number {
  if (Array.isArray(args.selectedHighlightIds)) {
    return args.selectedHighlightIds.length;
  }
  if (Array.isArray(args.editedHighlights)) {
    return args.editedHighlights.length;
  }
  return boundedCount(args.maxClips, 10, CLIP_HIGHLIGHT_COUNT_MAXIMUM);
}

function quoteAmount(args: Record<string, unknown>): number | null {
  const amount = args.maximumCredits;
  return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0
    ? amount
    : null;
}

/**
 * Estimated credits for one call, from the same helpers the debit path uses.
 * `null` means the amount is a persisted quote that is not on these arguments.
 * This does not debit.
 */
export function estimateToolCreditCost(
  name: string,
  parameters: unknown,
  pricing?: ToolCreditPricing,
): number | null {
  const args: Record<string, unknown> = {};
  if (
    parameters !== null &&
    typeof parameters === 'object' &&
    !Array.isArray(parameters)
  ) {
    Object.assign(args, parameters);
  }
  const resolved = pricing ?? fixedCreditPricing(0);
  if (name === MEDIA_GENERATION_TOOL_NAME) {
    return getMediaGenerationCreditFloor(args);
  }
  if (name === 'generate_content_batch') {
    const requested =
      typeof args.count === 'number' && args.count > 0
        ? Math.floor(args.count)
        : 10;
    return estimateBatchGenerationCredits(
      {
        contentMix: contentMixFromToolArguments(args.contentMix),
        count: Math.min(requested, BATCH_GENERATION_COUNT_MAXIMUM),
      },
      { includeMedia: false },
    );
  }
  if (name === MEDIA_TRANSFORM_TOOL_NAME) {
    const operation = getMediaTransformOperation(name, args);
    if (operation === 'merge') return 0;
    if (!operation) return null;
    return MEDIA_GENERATION_CREDIT_FLOORS.image;
  }
  if (name === 'repurpose_post') {
    return args.mode === 'agent' ? BATCH_CAPTION_BASE_CREDITS : 0;
  }
  if (
    name === 'create_clip_project_from_youtube' ||
    name === 'generate_clips'
  ) {
    return clipCreditGateAmount(clipCount(args));
  }
  if (resolved.mode === 'fixed') return resolved.amount;
  if (resolved.mode === 'quote') return quoteAmount(args);
  return null;
}
