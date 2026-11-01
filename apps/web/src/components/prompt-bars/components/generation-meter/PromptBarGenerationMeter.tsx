'use client';

import type { PromptBarGenerationMeterProps } from '@props/prompt-bars/prompt-bar-generation-meter.props';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import type { ReactElement } from 'react';

export default function PromptBarGenerationMeter({
  meter,
}: PromptBarGenerationMeterProps): ReactElement {
  return (
    <SimpleTooltip label={meter.ariaLabel}>
      <output
        aria-label={meter.ariaLabel}
        className="min-w-0 max-w-[8.5rem] truncate px-1 text-2xs font-medium tabular-nums text-muted-foreground"
        data-testid="studio-generation-meter"
      >
        {meter.label}
      </output>
    </SimpleTooltip>
  );
}
