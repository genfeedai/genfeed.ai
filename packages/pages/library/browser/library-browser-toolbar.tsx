'use client';

import { ButtonVariant, ComponentSize, ViewType } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { LibraryBrowserToolbarProps } from '@props/pages/library-browser.props';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import { LayoutGrid, Rows3, Upload, X } from 'lucide-react';
import type { ChangeEvent } from 'react';

import { LIBRARY_TYPE_CHIPS } from './library-browser.config';

const VIEW_OPTIONS = [
  {
    icon: <LayoutGrid className="size-4" />,
    label: 'Contact sheet',
    type: ViewType.GRID,
  },
  { icon: <Rows3 className="size-4" />, label: 'List', type: ViewType.LIST },
];

/**
 * The Library's control plane: the type axis as multi-select chips, plus
 * search, sort and density. The shelf and folder axes are *not* here — a shelf
 * is the route and a folder is the sidebar, so putting either in this row would
 * re-collapse the three axes the redesign just separated.
 */
export default function LibraryBrowserToolbar({
  categories,
  search,
  sort,
  sortOptions,
  viewMode,
  isRefreshing,
  onToggleCategories,
  onClearCategories,
  onSearchChange,
  onSortChange,
  onViewModeChange,
  onRefresh,
  onUpload,
}: LibraryBrowserToolbarProps) {
  const hasTypeFilter = categories.length > 0;

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {LIBRARY_TYPE_CHIPS.map((chip) => {
          const isActive = chip.categories.every((category) =>
            categories.includes(category),
          );

          return (
            <Button
              key={chip.label}
              aria-pressed={isActive}
              className={cn(
                'h-7 rounded-full border px-3 text-xs font-medium transition-colors',
                isActive
                  ? 'border-border-strong bg-foreground text-background'
                  : 'border-border bg-card text-foreground/70 hover:bg-hover hover:text-foreground',
              )}
              onClick={() => onToggleCategories(chip.categories)}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            >
              {chip.label}
            </Button>
          );
        })}

        {hasTypeFilter ? (
          <Button
            className="h-7 rounded-full px-2 text-xs text-foreground/50 hover:text-foreground"
            icon={<X className="size-3.5" />}
            onClick={onClearCategories}
            tooltip="Clear type filter"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          />
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="w-44 sm:w-56">
          <FormSearchbar
            className="w-full"
            inputClassName="h-8 rounded-md border-border bg-card text-foreground focus:border-border-strong focus:outline-none"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onSearchChange(event.target.value)
            }
            onClear={() => onSearchChange('')}
            placeholder="Search this brand's assets"
            size={ComponentSize.SM}
            value={search}
          />
        </div>

        <ButtonDropdown
          className="h-8 rounded-md border border-border bg-secondary px-3 text-sm text-foreground/80 hover:bg-hover hover:text-foreground"
          name="sort"
          onChange={(_name, value) => onSortChange(value)}
          options={sortOptions}
          value={sort}
        />

        <ViewToggle
          activeView={viewMode === 'list' ? ViewType.LIST : ViewType.GRID}
          onChange={(view) =>
            onViewModeChange(view === ViewType.LIST ? 'list' : 'grid')
          }
          options={VIEW_OPTIONS}
          size={ComponentSize.SM}
        />

        <ButtonRefresh isRefreshing={isRefreshing} onClick={onRefresh} />

        <Button
          icon={<Upload />}
          onClick={onUpload}
          tooltip="Upload"
          variant={ButtonVariant.SECONDARY}
        />
      </div>
    </div>
  );
}
