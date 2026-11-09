'use client';

import { ViewType } from '@genfeedai/contracts';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import SubbarControls from '@ui/layout/subbar-controls/SubbarControls';
import ViewMenu from '@ui/navigation/view-menu/ViewMenu';
import { SHELL_ICON_CLASS } from '@ui-constants/shell-chrome.constant';
import { LayoutGrid, Rows3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import SearchField from '@/components/content/search-field/SearchField';
import type { UseStudioResultsFiltersReturn } from '@/features/studio/playground/hooks/useStudioResultsFilters';
import {
  isStudioPlaygroundType,
  listStudioPlaygroundTypeConfigs,
} from '@/features/studio/playground/utils/studio-playground-types';

export interface StudioPlaygroundTopbarProps
  extends Pick<
    UseStudioResultsFiltersReturn,
    | 'clearFilters'
    | 'resultSort'
    | 'resultType'
    | 'resultsView'
    | 'search'
    | 'setResultSort'
    | 'setResultType'
    | 'setResultsView'
    | 'setSearch'
  > {
  isLoadingGallery: boolean;
  refresh: () => Promise<void>;
}

/** Title, view switch, refresh, search and filters of the playground. */
export default function StudioPlaygroundTopbar({
  clearFilters,
  isLoadingGallery,
  refresh,
  resultSort,
  resultType,
  resultsView,
  search,
  setResultSort,
  setResultType,
  setResultsView,
  setSearch,
}: StudioPlaygroundTopbarProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');

  return (
    <SectionTopbar
      actions={
        <SubbarControls
          views={
            <ViewMenu
              activeView={resultsView}
              onChange={(view) => {
                if (view === ViewType.GRID || view === ViewType.LIST) {
                  setResultsView(view);
                }
              }}
              options={[
                {
                  icon: <Rows3 className={SHELL_ICON_CLASS} />,
                  label: translate('viewList'),
                  type: ViewType.LIST,
                },
                {
                  icon: <LayoutGrid className={SHELL_ICON_CLASS} />,
                  label: translate('viewGrid'),
                  type: ViewType.GRID,
                },
              ]}
            />
          }
        />
      }
      refresh={
        <ButtonRefresh isRefreshing={isLoadingGallery} onClick={refresh} />
      }
      leading={
        <SearchField
          ariaLabel={translate('searchPlaceholder')}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={translate('searchPlaceholder')}
          value={search}
        >
          <FilterMenu
            facets={[
              {
                defaultValue: 'all',
                key: 'type',
                label: translate('filters.type'),
                onChange: (value) => {
                  if (value === 'all' || isStudioPlaygroundType(value)) {
                    setResultType(value);
                  }
                },
                options: [
                  { label: translate('filters.allTypes'), value: 'all' },
                  ...listStudioPlaygroundTypeConfigs().map((config) => ({
                    label: config.label,
                    value: config.type,
                  })),
                ],
                selection: 'single',
                value: resultType,
              },
              {
                defaultValue: 'newest',
                isCounted: false,
                key: 'sort',
                label: translate('filters.sort'),
                onChange: (value) => {
                  if (value === 'newest' || value === 'oldest') {
                    setResultSort(value);
                  }
                },
                options: [
                  { label: translate('filters.newest'), value: 'newest' },
                  { label: translate('filters.oldest'), value: 'oldest' },
                ],
                selection: 'single',
                value: resultSort,
              },
            ]}
            isAttached
            onClear={clearFilters}
          />
        </SearchField>
      }
      title={translate('title')}
    />
  );
}
