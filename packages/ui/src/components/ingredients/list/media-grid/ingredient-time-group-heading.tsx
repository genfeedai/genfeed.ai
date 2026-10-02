'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IngredientTimeGroupHeadingProps } from '@genfeedai/props/content/ingredient.props';

const PINNED_SECTION_TOP = 'var(--pinned-topbar-height, 0px)';

export default function IngredientTimeGroupHeading({
  count,
  label,
  placement = 'under-topbar',
}: IngredientTimeGroupHeadingProps) {
  const isUnderColumnHeader = placement === 'under-column-header';

  return (
    <h3
      className={cn(
        'sticky m-0 border-b border-border bg-background py-2 text-sm font-semibold text-foreground',
        isUnderColumnHeader
          ? 'z-10 px-4'
          : 'z-[60] -mx-5 px-5 sm:-mx-6 sm:px-6',
      )}
      data-testid="ingredient-time-group-heading"
      style={{
        top: isUnderColumnHeader
          ? `calc(${PINNED_SECTION_TOP} + 2.5rem)`
          : PINNED_SECTION_TOP,
      }}
    >
      {label}
      <span className="text-foreground/55"> · {count}</span>
    </h3>
  );
}
