'use client';

import { ButtonSize, ButtonVariant, ViewType } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  CollectionToolbarProps,
  CollectionViewType,
} from '@genfeedai/props/ui/collection/collection.props';
import type { ViewOption } from '@genfeedai/props/ui/navigation/view-toggle.props';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { Button } from '@ui/primitives/button';
import { SHELL_ICON_CLASS } from '@ui-constants/shell-chrome.constant';
import { LayoutGrid, Rows3, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

/**
 * The one toolbar row a collection gets: search, Type/Category dropdowns,
 * sort and the list/grid toggle. Active filters sit beneath as removable
 * chips — there is no filter sidebar.
 */
export default function CollectionToolbar({
  search,
  filters,
  sort,
  view,
  onViewChange,
  chips = [],
  onClearChips,
  className,
}: CollectionToolbarProps) {
  const translate = useTranslations('ui.collection');
  const hasViewToggle = view !== undefined && onViewChange !== undefined;
  const viewOptions = useMemo<ViewOption<CollectionViewType>[]>(
    () => [
      {
        icon: <Rows3 className={SHELL_ICON_CLASS} />,
        label: translate('list'),
        type: ViewType.LIST,
      },
      {
        icon: <LayoutGrid className={SHELL_ICON_CLASS} />,
        label: translate('grid'),
        type: ViewType.GRID,
      },
    ],
    [translate],
  );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {search ? <div className="min-w-0 flex-1">{search}</div> : null}
        {filters ? (
          <div className="flex flex-wrap items-center gap-2">{filters}</div>
        ) : null}
        {sort || hasViewToggle ? (
          <div className="ml-auto flex items-center gap-2">
            {sort}
            {hasViewToggle ? (
              <ViewToggle
                activeView={view}
                onChange={onViewChange}
                options={viewOptions}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <Button
              ariaLabel={
                typeof chip.label === 'string'
                  ? translate('removeFilter', { label: chip.label })
                  : translate('removeFilterFallback')
              }
              icon={<X className="size-3.5" />}
              key={chip.id}
              label={chip.label}
              onClick={chip.onRemove}
              size={ButtonSize.XS}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            />
          ))}
          {onClearChips && chips.length > 1 ? (
            <Button
              label={translate('clearAll')}
              onClick={onClearChips}
              size={ButtonSize.XS}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
