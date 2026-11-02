'use client';

import { ViewType } from '@genfeedai/contracts';
import {
  LIBRARY_CANVAS_FEATURE_FLAG,
  type LibraryViewMode,
} from '@genfeedai/contracts/constants';
import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import SubbarOverflowMenu from '@ui/layout/subbar-overflow-menu/SubbarOverflowMenu';
import ViewMenu from '@ui/navigation/view-menu/ViewMenu';
import { SHELL_ICON_CLASS } from '@ui-constants/shell-chrome.constant';
import {
  Frame,
  LayoutGrid,
  Rows3,
  Settings2,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import SearchField from '@/components/content/search-field/SearchField';
import LibraryTagManagerDialog from '@/features/library/components/tags/library-tag-picker/LibraryTagManagerDialog';
import type {
  LibraryBrowserSearchProps,
  LibraryBrowserToolbarProps,
} from '@/features/library/props/library-browser.props';
import { useFeatureFlag } from '@/hooks/feature-flags/use-feature-flag/use-feature-flag';

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

/**
 * The Library's "..." menu: review unsorted, tags, upload. Refresh goes in the
 * topbar `refresh` slot, next to it.
 */
export function LibraryBrowserOverflowMenu({
  reviewUnsortedHref,
  onUpload,
}: Pick<LibraryBrowserToolbarProps, 'onUpload' | 'reviewUnsortedHref'>) {
  const translate = useTranslations('pages.library.browser.toolbar');
  const translateTags = useTranslations('pages.library.tags');
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const actions: CollectionOverflowAction[] = [
    ...(reviewUnsortedHref
      ? [
          {
            href: reviewUnsortedHref,
            icon: <Sparkles className="size-4" />,
            id: 'review-unsorted',
            label: translate('startUnsortedReview'),
          },
        ]
      : []),
    {
      icon: <Settings2 className="size-4" />,
      id: 'manage-tags',
      label: translateTags('manageTags'),
      onSelect: () => setIsTagManagerOpen(true),
    },
    {
      icon: <Upload className="size-4" />,
      id: 'upload',
      label: translate('upload'),
      onSelect: onUpload,
    },
  ];

  return (
    <>
      <SubbarOverflowMenu actions={actions} />
      <LibraryTagManagerDialog
        isOpen={isTagManagerOpen}
        onOpenChange={setIsTagManagerOpen}
      />
    </>
  );
}
