'use client';

import { ButtonSize, ButtonVariant, ViewType } from '@genfeedai/contracts';
import {
  LIBRARY_CANVAS_FEATURE_FLAG,
  type LibraryViewMode,
} from '@genfeedai/contracts/constants';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag/use-feature-flag';
import SearchField from '@ui/content/search-field/SearchField';
import ViewMenu from '@ui/navigation/view-menu/ViewMenu';
import { Button } from '@ui/primitives/button';
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import { Frame, LayoutGrid, Rows3, Sparkles, Upload } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import LibraryTagManagerDialog from '@/features/library/components/tags/library-tag-picker/LibraryTagManagerDialog';
import type {
  LibraryBrowserSearchProps,
  LibraryBrowserToolbarProps,
} from '@/features/library/props/library-browser.props';

import LibraryFiltersMenu from './library-filters-menu';

const GRID_VIEW_OPTION = {
  icon: <LayoutGrid className={SHELL_ICON_CLASS} />,
  type: ViewType.GRID,
};

const LIST_VIEW_OPTION = {
  icon: <Rows3 className={SHELL_ICON_CLASS} />,
  type: ViewType.LIST,
};

const CANVAS_VIEW_OPTION = {
  icon: <Frame className={SHELL_ICON_CLASS} />,
  type: ViewType.CANVAS,
};

/**
 * The same filtered result set, arranged three ways. Canvas is the mood board:
 * it moved off its own route so the shelf, folder and type axes keep applying
 * to it instead of being abandoned at a nav link.
 */
const VIEW_TYPE_TO_MODE: Record<string, LibraryViewMode> = {
  [ViewType.CANVAS]: 'canvas',
  [ViewType.GRID]: 'grid',
  [ViewType.LIST]: 'list',
};

const MODE_TO_VIEW_TYPE: Record<LibraryViewMode, ViewType> = {
  canvas: ViewType.CANVAS,
  grid: ViewType.GRID,
  list: ViewType.LIST,
};

/** The Library search, with the one Filters menu (everything but the view) inside it. */
export function LibraryBrowserSearch({
  onSearch,
  placeholder,
  search,
  ...filterProps
}: LibraryBrowserSearchProps) {
  return (
    <SearchField onSearch={onSearch} placeholder={placeholder} value={search}>
      <LibraryFiltersMenu {...filterProps} isAttached />
    </SearchField>
  );
}

/**
 * The Library's view switch. The filters and sort live in the search field;
 * folder stays in the sidebar. Grouped failure recovery has one arrangement,
 * so it shows no switch.
 */
export default function LibraryBrowserToolbar({
  isRecoveryView = false,
  onViewModeChange,
  viewMode,
}: Pick<
  LibraryBrowserToolbarProps,
  'isRecoveryView' | 'onViewModeChange' | 'viewMode'
>) {
  const translate = useTranslations('pages.library.browser.toolbar');
  const isCanvasEnabled = useFeatureFlag(LIBRARY_CANVAS_FEATURE_FLAG);

  const viewOptions = useMemo(() => {
    const options = [
      { ...GRID_VIEW_OPTION, label: translate('contactSheet') },
      { ...LIST_VIEW_OPTION, label: translate('list') },
    ];
    if (isCanvasEnabled) {
      options.push({ ...CANVAS_VIEW_OPTION, label: translate('canvas') });
    }
    return options;
  }, [isCanvasEnabled, translate]);

  if (isRecoveryView) {
    return null;
  }

  return (
    <ViewMenu
      activeView={MODE_TO_VIEW_TYPE[viewMode]}
      onChange={(view) => onViewModeChange(VIEW_TYPE_TO_MODE[view] ?? 'grid')}
      options={viewOptions}
    />
  );
}

/** Ghost actions only; Refresh goes in the topbar `refresh` slot. */
export function LibraryBrowserIconActions({
  reviewUnsortedHref,
  onUpload,
}: Pick<LibraryBrowserToolbarProps, 'onUpload' | 'reviewUnsortedHref'>) {
  const translate = useTranslations('pages.library.browser.toolbar');
  return (
    <div
      className="flex items-center gap-1"
      data-testid="library-toolbar-icon-actions"
    >
      {reviewUnsortedHref ? (
        <Button
          asChild
          className={SHELL_ICON_BUTTON_CLASS}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          tooltip={translate('startUnsortedReview')}
          withWrapper={false}
        >
          <Link
            href={reviewUnsortedHref}
            aria-label={translate('startUnsortedReview')}
          >
            <Sparkles className={SHELL_ICON_CLASS} />
          </Link>
        </Button>
      ) : null}
      <LibraryTagManagerDialog />
      <Button
        ariaLabel={translate('upload')}
        className={SHELL_ICON_BUTTON_CLASS}
        icon={<Upload className={SHELL_ICON_CLASS} />}
        onClick={onUpload}
        size={ButtonSize.ICON}
        tooltip={translate('upload')}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      />
    </div>
  );
}
