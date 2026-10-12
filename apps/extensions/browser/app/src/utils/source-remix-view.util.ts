import type { BrandRemixRunView } from '~models/source-remix.model';

export type SourceRemixStage =
  | 'draft'
  | 'quoted'
  | 'generating'
  | 'done'
  | 'failed'
  | 'studio';

const DONE_PHASES: readonly BrandRemixRunView['phase'][] = [
  'ready_for_review',
  'partially_ready',
  'in_review',
  'approved',
  'paid_draft_creating',
  'paid_draft_ready',
];

export const REMIX_ASPECT_RATIOS: readonly string[] = [
  '1:1',
  '4:5',
  '9:16',
  '16:9',
];
export const REMIX_TARGET_PLATFORMS: readonly {
  label: string;
  value: string;
}[] = [
  { label: 'X', value: 'x' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'YouTube', value: 'youtube' },
];

/** Video and avatar remixes use the scene plan in Studio, which has its own quotes. */
export function isStudioOutput(run: BrandRemixRunView): boolean {
  return (
    run.draft.output.kind === 'video' || run.draft.output.kind === 'avatar'
  );
}

export function hasOpenQuote(run: BrandRemixRunView, now: number): boolean {
  const quote = run.generationQuote;
  return Boolean(
    quote &&
      !quote.acceptedAt &&
      quote.revision === run.revision &&
      Date.parse(quote.expiresAt) > now,
  );
}

export function remixStage(
  run: BrandRemixRunView,
  now: number,
  isEditing: boolean,
): SourceRemixStage {
  if (isStudioOutput(run)) return 'studio';
  if (run.phase === 'failed') return 'failed';
  if (run.phase === 'generating') return 'generating';
  if (DONE_PHASES.includes(run.phase)) return 'done';
  return hasOpenQuote(run, now) && !isEditing ? 'quoted' : 'draft';
}

export function failureReason(run: BrandRemixRunView): string {
  const errors = (run.execution?.variants ?? [])
    .map((variant) => variant.error)
    .filter((error): error is string => Boolean(error));
  return (
    errors[0] ??
    run.execution?.partialReason ??
    'The generation did not finish.'
  );
}

export function variantProgress(run: BrandRemixRunView): {
  failed: number;
  ready: number;
  total: number;
} {
  const variants = run.execution?.variants ?? [];
  return {
    failed: variants.filter((variant) => variant.status === 'failed').length,
    ready: variants.filter((variant) => variant.status === 'ready').length,
    total: run.execution?.requestedCount ?? run.draft.output.count,
  };
}

export function quoteSummary(
  quote: NonNullable<BrandRemixRunView['generationQuote']>,
): string {
  if (quote.billingMode === 'byok') {
    return `${quote.count} ${quote.outputKind} ${quote.count === 1 ? 'variation' : 'variations'} billed to your own provider key. Genfeed credits: 0.`;
  }
  return `${quote.count} ${quote.outputKind} ${quote.count === 1 ? 'variation' : 'variations'} × ${quote.unitCredits} credits = ${quote.total} credits.`;
}
