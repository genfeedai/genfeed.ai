'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ModelSelectorQualityBarProps } from '@genfeedai/props/ui/model-selector/model-selector.props';
import { getQualityTierLevel } from '@ui/dropdowns/model-selector/model-selector.utils';
import { memo } from 'react';

const QUALITY_BAR_MAX = 4;
const QUALITY_BAR_HEIGHT_CLASS = ['h-1.5', 'h-2', 'h-2.5', 'h-3'] as const;

const ModelSelectorQualityBar = memo(function ModelSelectorQualityBar({
  qualityTier,
}: ModelSelectorQualityBarProps) {
  const filled = getQualityTierLevel(qualityTier);
  if (filled <= 0) {
    return null;
  }

  return (
    <span
      role="meter"
      aria-label="Quality"
      aria-valuemin={1}
      aria-valuemax={QUALITY_BAR_MAX}
      aria-valuenow={filled}
      aria-valuetext={qualityTier}
      className="inline-flex h-3 items-end gap-px"
    >
      {QUALITY_BAR_HEIGHT_CLASS.map((heightClass, index) => {
        const level = index + 1;
        return (
          <span
            key={level}
            className={cn(
              'w-1 rounded-sm',
              heightClass,
              level <= filled ? 'bg-foreground' : 'bg-foreground/20',
            )}
          />
        );
      })}
    </span>
  );
});

export default ModelSelectorQualityBar;
