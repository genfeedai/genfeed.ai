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
      <div className="h-4 w-4 shrink-0 rounded-full bg-primary/20 text-center text-[10px] leading-4 text-primary">
        {activeBrand.label.charAt(0).toUpperCase()}
      </div>
      <span className="truncate text-xs font-medium text-foreground">
        {activeBrand.label}
      </span>
      {voiceSummary && (
        <>
          <span className="text-[10px] text-muted-foreground">&middot;</span>
          <span className="truncate text-[10px] text-muted-foreground">
            {voiceSummary}
          </span>
        </>
      )}
    </div>
  );
}
