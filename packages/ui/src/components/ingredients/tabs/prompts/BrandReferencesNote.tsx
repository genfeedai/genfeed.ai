'use client';

import type { GenerationBrandReferencesNoteProps } from '@genfeedai/props/ui/generation-setup/generation-harness.props';
import { useTranslations } from 'next-intl';

/**
 * Which brand references a generation used when the caller attached none, or
 * why a model that takes no reference images got none. Nothing renders when the
 * receipt records neither.
 */
export default function BrandReferencesNote({
  references,
}: GenerationBrandReferencesNoteProps) {
  const translate = useTranslations('ui.generationHarness.references');
  const count = references.attachedAssetIds.length;

  if (count === 0 && !references.skippedReason) return null;

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        {translate('title')}
      </p>
      <p className="text-xs text-muted-foreground">
        {count > 0 ? translate('added', { count }) : translate('skipped')}
      </p>
    </div>
  );
}
