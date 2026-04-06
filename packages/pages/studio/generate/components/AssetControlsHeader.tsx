'use client';

import type { IngredientCategory } from '@genfeedai/enums';
import { IngredientFormat, IngredientStatus, ViewType } from '@genfeedai/enums';
import type { IFiltersState } from '@genfeedai/interfaces/utils/filters.interface';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import FiltersBar from '@ui/content/filters-bar/FiltersBar';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { HiSquares2X2, HiTableCells } from 'react-icons/hi2';

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
  const controlGroupClassName =
    'flex items-center rounded-xl border border-white/10 bg-white/[0.03] p-1';

  return (
    <div className="border-b border-white/[0.08] px-4 py-2">
      <div className="flex w-full items-center justify-between gap-3">
        <h1 className="text-sm font-semibold tracking-tight">
          {categoryLabel}
        </h1>

        <div
          data-testid="asset-controls-toolbar"
          className="flex flex-wrap items-center justify-end gap-2"
        >
          <div
            data-testid="asset-controls-filters"
            className={controlGroupClassName}
          >
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

          {showViewToggle && (
            <div
              data-testid="asset-controls-view-toggle"
              className={controlGroupClassName}
            >
              <ViewToggle
                options={[
                  {
                    icon: <HiSquares2X2 className="w-4 h-4" />,
                    label: 'Masonry view',
                    type: ViewType.MASONRY,
                  },
                  {
                    icon: <HiTableCells className="w-4 h-4" />,
                    label: 'Table view',
                    type: ViewType.TABLE,
                  },
                ]}
                activeView={viewMode}
                onChange={onViewModeChange}
              />
            </div>
          )}

          <div
            data-testid="asset-controls-refresh"
            className={controlGroupClassName}
          >
            <ButtonRefresh onClick={onRefresh} isRefreshing={isRefreshing} />
          </div>
        </div>
      </div>
    </div>
  );
}
