'use client';

import type { IngredientCategory } from '@genfeedai/enums';
import { IngredientFormat, IngredientStatus, ViewType } from '@genfeedai/enums';
import type { IFiltersState } from '@genfeedai/interfaces/utils/filters.interface';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import FiltersBar from '@ui/content/filters-bar/FiltersBar';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { LayoutGrid, Table } from 'lucide-react';

const CATEGORY_HEADER_LABELS: Record<string, string> = {
  avatar: 'Avatar Generation',
  image: 'Image Generation',
  music: 'Music Generation',
  video: 'Video Generation',
};

interface AssetControlsHeaderProps {
  filters: IFiltersState;
  onFiltersChange: (filters: IFiltersState) => void;
  isImageOrVideo: boolean;
  supportsMasonry: boolean;
  viewMode: ViewType.MASONRY | ViewType.TABLE;
  onViewModeChange: (mode: ViewType) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  categoryType?: IngredientCategory;
}

/**
 * Studio asset toolbar: filters + view mode + refresh.
 *
 * Do not wrap ViewToggle / ButtonRefresh in another bordered pill — ViewToggle
 * already owns `gen-shell-segmented` chrome, and refresh is a single ghost icon
 * control (same as ListPageLayout / ads research). Extra outer shells produce
 * the double-border look.
 */
export function AssetControlsHeader({
  filters,
  onFiltersChange,
  isImageOrVideo,
  supportsMasonry,
  viewMode,
  onViewModeChange,
  onRefresh,
  isRefreshing,
  categoryType,
}: AssetControlsHeaderProps) {
  const categoryLabel = categoryType
    ? (CATEGORY_HEADER_LABELS[categoryType] ?? 'Generation')
    : 'Generation';
  const showViewToggle = supportsMasonry;

  return (
    <div className="w-full border-b border-white/[0.08] px-6 py-2">
      <div className="flex w-full items-center justify-end gap-3">
        <h1 className="sr-only">{categoryLabel}</h1>

        <div
          data-testid="asset-controls-toolbar"
          className="flex flex-wrap items-center justify-end gap-2"
        >
          <div data-testid="asset-controls-filters">
            <FiltersBar
              filters={filters}
              className="flex-shrink-0 !w-auto justify-end gap-1.5"
              onFiltersChange={onFiltersChange}
              visibleFilters={{
                favorite: false,
                format: isImageOrVideo,
                provider: false,
                search: false,
                sort: true,
                status: true,
                type: false,
              }}
              filterOptions={{
                format: [
                  { label: '1:1', value: IngredientFormat.SQUARE },
                  { label: '16:9', value: IngredientFormat.LANDSCAPE },
                  { label: '9:16', value: IngredientFormat.PORTRAIT },
                ],
                sort: [
                  { label: 'Newest First', value: 'createdAt: -1' },
                  { label: 'Oldest First', value: 'createdAt: 1' },
                ],
                status: [
                  { label: 'Processing', value: IngredientStatus.PROCESSING },
                  { label: 'Completed', value: IngredientStatus.GENERATED },
                  { label: 'Validated', value: IngredientStatus.VALIDATED },
                  { label: 'Failed', value: IngredientStatus.FAILED },
                  { label: 'Archived', value: IngredientStatus.ARCHIVED },
                  { label: 'Rejected', value: IngredientStatus.REJECTED },
                ],
              }}
            />
          </div>

          {showViewToggle ? (
            <div data-testid="asset-controls-view-toggle">
              <ViewToggle
                options={[
                  {
                    icon: <LayoutGrid className="size-3.5" />,
                    label: 'Masonry view',
                    type: ViewType.MASONRY,
                  },
                  {
                    icon: <Table className="size-3.5" />,
                    label: 'Table view',
                    type: ViewType.TABLE,
                  },
                ]}
                activeView={viewMode}
                onChange={onViewModeChange}
              />
            </div>
          ) : null}

          <div data-testid="asset-controls-refresh">
            <ButtonRefresh
              onClick={onRefresh}
              isRefreshing={isRefreshing}
              className="gen-shell-control size-8 rounded-md [&_svg]:size-3.5"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
