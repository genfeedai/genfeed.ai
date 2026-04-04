'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { ModelSelectorCostBadgeProps } from '@props/ui/model-selector/model-selector.props';
import { getCostTierDisplay } from '@ui/dropdowns/model-selector/model-selector.utils';
import { memo } from 'react';

const ModelSelectorCostBadge = memo(function ModelSelectorCostBadge({
  costTier,
}: ModelSelectorCostBadgeProps) {
  const display = getCostTierDisplay(costTier);
  if (!display) {
    return null;
  }

  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
        display.colorClass,
      )}
    >
      {display.symbol}
    </span>
  );
});

export default ModelSelectorCostBadge;
