'use client';

import type { SubbarControlsProps } from '@props/layout/subbar-controls.props';

/**
 * The controls cluster of a subbar. `AdminPageShell`, `ListPageLayout` and
 * the pages that render `Container` or `SectionTopbar` directly all put their
 * controls through this, so the order is owned in one place and a page cannot
 * reorder it: dropdowns, Filters, views, primary action.
 */
export default function SubbarControls({
  dropdowns,
  filters,
  views,
  primaryAction,
}: SubbarControlsProps) {
  return (
    <>
      {dropdowns}
      {filters}
      {views}
      {primaryAction}
    </>
  );
}
