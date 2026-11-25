'use client';

import type { GenerationBrandPaletteProofProps } from '@genfeedai/props/ui/generation-setup/generation-harness.props';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';

const KNOWN_REASONS: ReadonlySet<string> = new Set([
  'artifact_undecodable',
  'palette_color_translucent',
  'visual_composite_unproven',
  'visual_part_unavailable',
  'visual_too_small',
]);

/** Whole percent, with `<1%` for a colour that is there but barely. */
function formatCoverage(coverage: number): string {
  if (coverage <= 0) return '0%';
  if (coverage < 0.01) return '<1%';
  return `${Math.round(coverage * 100)}%`;
}

/**
 * The approved palette measured on a finished output: one row per colour with
 * its share of the pixels. A miss is information, so only a missing required
 * colour turns the summary red; the generation was never stopped by either.
 */
export default function BrandPaletteProof({
  palette,
}: GenerationBrandPaletteProofProps) {
  const translate = useTranslations('ui.generationHarness.palette');

  if (palette.status === 'not_measured') {
    const reason = KNOWN_REASONS.has(palette.reasonCode)
      ? palette.reasonCode
      : 'unknown';
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          {translate('title')}
        </p>
        <p className="text-xs text-muted-foreground">
          {translate('notMeasured', { reason: translate(`reason.${reason}`) })}
        </p>
      </div>
    );
  }

  const { colors } = palette;
  const foundCount = colors.filter((color) => color.result === 'found').length;
  const hasRequiredMiss = colors.some(
    (color) => color.isRequired && color.result === 'absent',
  );
  const summaryVariant = hasRequiredMiss
    ? 'destructive'
    : foundCount === colors.length
      ? 'success'
      : 'warning';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {translate('title')}
        </p>
        <Badge variant={summaryVariant}>
          {translate('summary', { found: foundCount, total: colors.length })}
        </Badge>
      </div>
      <ul className="space-y-1.5">
        {colors.map((color) => (
          <li key={color.id} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden="true"
              className="size-5 shrink-0 rounded-sm border border-border"
              style={{ backgroundColor: color.hex }}
            />
            <span className="min-w-0 flex-1">
              <span className="font-mono text-xs">{color.hex}</span>
              <span className="text-xs text-muted-foreground">
                {color.usage ? ` · ${color.usage}` : ''}
                {color.isRequired ? ` · ${translate('required')}` : ''}
              </span>
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {translate('coverage', {
                percent: formatCoverage(color.coverage),
              })}
            </span>
            <Badge
              variant={
                color.result === 'found'
                  ? 'success'
                  : color.isRequired
                    ? 'destructive'
                    : 'warning'
              }
            >
              {translate(color.result === 'found' ? 'found' : 'absent')}
            </Badge>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {hasRequiredMiss
          ? translate('requiredMissHint')
          : translate('measuredHint')}
      </p>
    </div>
  );
}
