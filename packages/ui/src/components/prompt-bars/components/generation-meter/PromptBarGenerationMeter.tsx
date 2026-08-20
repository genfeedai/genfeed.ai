'use client';

import type { PromptBarGenerationMeterProps } from '@props/prompt-bars/prompt-bar-generation-meter.props';
import type { ReactElement } from 'react';

export default function PromptBarGenerationMeter({
  meter,
}: PromptBarGenerationMeterProps): ReactElement {
  return (
    <output
      aria-label={meter.ariaLabel}
      className="min-w-0 max-w-[8.5rem] truncate px-1 text-2xs font-medium tabular-nums text-foreground/45"
      data-testid="studio-generation-meter"
      title={meter.ariaLabel}
    >
      {meter.label}
    </output>
  );
}
