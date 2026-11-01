import { Avatar } from '@ui/primitives/avatar';
import type { ReactElement } from 'react';

import { useBrandStore } from '~store/use-brand-store';

export function BrandVoiceIndicator(): ReactElement | null {
  const brands = useBrandStore((s) => s.brands);
  const activeBrandId = useBrandStore((s) => s.activeBrandId);
  const brandVoice = useBrandStore((s) => s.brandVoice);

  const activeBrand = brands.find((b) => b.id === activeBrandId);

  if (!activeBrand) {
    return null;
  }

  const voiceSummary = [brandVoice?.tone, brandVoice?.voice]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
      <Avatar name={activeBrand.label} size="2xs" />
      <span className="truncate text-xs font-medium text-foreground">
        {activeBrand.label}
      </span>
      {voiceSummary && (
        <>
          <span className="text-2xs text-muted-foreground">&middot;</span>
          <span className="truncate text-2xs text-muted-foreground">
            {voiceSummary}
          </span>
        </>
      )}
    </div>
  );
}
