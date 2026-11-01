'use client';

import { ViewType } from '@genfeedai/contracts';
import type { PublishingPostsViewMode } from '@genfeedai/contracts/constants';
import ViewMenu from '@ui/navigation/view-menu/ViewMenu';
import { Kanban, LayoutGrid, Rows3 } from 'lucide-react';
import { useTranslations } from 'next-intl';

type PublishingPostsViewType = ViewType.GRID | ViewType.KANBAN | ViewType.LIST;

const VIEW_TYPE_TO_MODE: Record<
  PublishingPostsViewType,
  PublishingPostsViewMode
> = {
  [ViewType.GRID]: 'grid',
  [ViewType.KANBAN]: 'board',
  [ViewType.LIST]: 'list',
};

export interface PublishingViewToggleProps {
  activeView: PublishingPostsViewType;
  onViewModeChange: (mode: PublishingPostsViewMode) => void;
}

/**
 * How the Posts desk lays out its results: list, board or grid. Calendar and
 * Approvals are pages in the Publishing sidebar, so they never appear here.
 */
export default function PublishingViewToggle({
  activeView,
  onViewModeChange,
}: PublishingViewToggleProps): React.JSX.Element {
  const translate = useTranslations('pages.posts.list.viewToggle');

  return (
    <ViewMenu
      activeView={activeView}
      onChange={(nextView) => onViewModeChange(VIEW_TYPE_TO_MODE[nextView])}
      options={[
        {
          icon: <Rows3 className="size-3.5 shrink-0" />,
          label: translate('list'),
          type: ViewType.LIST,
        },
        {
          icon: <Kanban className="size-3.5 shrink-0" />,
          label: translate('board'),
          type: ViewType.KANBAN,
        },
        {
          icon: <LayoutGrid className="size-3.5 shrink-0" />,
          label: translate('grid'),
          type: ViewType.GRID,
        },
      ]}
    />
  );
}
