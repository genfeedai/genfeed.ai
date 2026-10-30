'use client';

import { ViewType } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  type PublishingPostsViewMode,
} from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import ViewMenu from '@ui/navigation/view-menu/ViewMenu';
import {
  CalendarDays,
  ClipboardCheck,
  Kanban,
  LayoutGrid,
  Rows3,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

const VIEW_TYPE_TO_MODE: Partial<Record<ViewType, PublishingPostsViewMode>> = {
  [ViewType.GRID]: 'grid',
  [ViewType.KANBAN]: 'board',
  [ViewType.LIST]: 'list',
};

export interface PublishingViewToggleProps {
  activeView: ViewType;
  /**
   * How the Posts desk switches between its own list, board and grid. The
   * Calendar and Approvals desks omit it and navigate to Posts instead.
   */
  onViewModeChange?: (mode: PublishingPostsViewMode) => void;
}

/**
 * The Publishing desk switcher. Calendar and Approvals are routes of their own
 * (`APP_ROUTES.PUBLISHING.CALENDAR` / `APPROVALS`); list, board and grid are
 * display modes of the Posts route.
 */
export default function PublishingViewToggle({
  activeView,
  onViewModeChange,
}: PublishingViewToggleProps): React.JSX.Element {
  const translate = useTranslations('pages.posts.list.viewToggle');
  const { href } = useOrgUrl();
  const { push } = useRouter();

  function handleChange(nextView: ViewType) {
    if (nextView === ViewType.CALENDAR) {
      push(href(APP_ROUTES.PUBLISHING.CALENDAR));
      return;
    }
    if (nextView === ViewType.APPROVALS) {
      push(href(APP_ROUTES.PUBLISHING.APPROVALS));
      return;
    }
    const mode = VIEW_TYPE_TO_MODE[nextView] ?? 'list';
    if (onViewModeChange) {
      onViewModeChange(mode);
      return;
    }
    push(
      href(
        mode === 'list'
          ? APP_ROUTES.PUBLISHING.POSTS
          : `${APP_ROUTES.PUBLISHING.POSTS}?view=${mode}`,
      ),
    );
  }

  return (
    <ViewMenu
      activeView={activeView}
      onChange={handleChange}
      options={[
        {
          icon: <CalendarDays className="size-3.5 shrink-0" />,
          label: translate('calendar'),
          type: ViewType.CALENDAR,
        },
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
        {
          icon: <ClipboardCheck className="size-3.5 shrink-0" />,
          label: translate('approvals'),
          type: ViewType.APPROVALS,
        },
      ]}
    />
  );
}
