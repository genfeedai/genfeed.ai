'use client';

import { ViewType } from '@genfeedai/contracts';
import type {
  CollectionViewToggleProps,
  CollectionViewType,
} from '@genfeedai/props/ui/collection/collection.props';
import type { ViewOption } from '@genfeedai/props/ui/navigation/view-option.props';
import ViewMenu from '@ui/navigation/view-menu/ViewMenu';
import { SHELL_ICON_CLASS } from '@ui-constants/shell-chrome.constant';
import { LayoutGrid, Rows3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

/**
 * The list/grid switch of a collection page. It belongs in the subbar, after
 * the Filters menu and before the page's primary action, never in the content.
 */
export default function CollectionViewToggle({
  view,
  onViewChange,
}: CollectionViewToggleProps) {
  const translate = useTranslations('ui.collection');
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
    <ViewMenu activeView={view} onChange={onViewChange} options={viewOptions} />
  );
}
