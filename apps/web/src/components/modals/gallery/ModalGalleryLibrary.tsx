'use client';

import {
  INGREDIENT_ORIGIN_LABELS,
  INGREDIENT_ORIGIN_ORDER,
  parseIngredientOrigin,
} from '@genfeedai/contracts';
import type { ModalGalleryLibraryProps } from '@genfeedai/props/modals/modal-gallery.props';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { useTranslations } from 'next-intl';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import SearchField from '@/components/content/search-field/SearchField';
import IngredientsMediaGrid from '@/components/ingredients/list/media-grid/IngredientsMediaGrid';
import { GALLERY_LIBRARY_DEFAULT_SORT } from '@/components/modals/gallery/hooks/useGalleryLibrary';
import InfiniteScroll from '@/features/ingredients/components/feedback/infinite-scroll/InfiniteScroll';
import { LIBRARY_SORT_OPTIONS } from '@/features/library/browser/library-browser.config';

const ORIGIN_OPTIONS = INGREDIENT_ORIGIN_ORDER.map((origin) => ({
  label: INGREDIENT_ORIGIN_LABELS[origin],
  value: origin,
}));

/**
 * The image and video picker is the Library: its search field with the
 * Filters menu attached, and its masonry grid. A tile click adds or removes
 * the asset from the picker's selection. The grid is the dialog's only scroll
 * region; the search stays put above it.
 */
export default function ModalGalleryLibrary({
  category,
  library,
  selectedIds,
  onToggleItem,
}: ModalGalleryLibraryProps) {
  const translate = useTranslations('ui.galleryModal');

  const facets: FilterMenuFacet[] = [
    {
      defaultValue: 'all',
      key: 'show',
      label: translate('show'),
      onChange: (value) => library.onStarredOnlyChange(value === 'starred'),
      options: [
        { label: translate('showAll'), value: 'all' },
        { label: translate('showStarred'), value: 'starred' },
      ],
      selection: 'single',
      value: library.isStarredOnly ? 'starred' : 'all',
    },
    {
      key: 'origin',
      label: translate('origin'),
      onChange: (values) =>
        library.onOriginsChange(
          values.flatMap((value) => {
            const origin = parseIngredientOrigin(value);
            return origin ? [origin] : [];
          }),
        ),
      options: ORIGIN_OPTIONS,
      selection: 'multiple',
      values: library.origins,
    },
    {
      defaultValue: GALLERY_LIBRARY_DEFAULT_SORT,
      isCounted: false,
      key: 'sort',
      label: translate('sort'),
      onChange: library.onSortChange,
      options: LIBRARY_SORT_OPTIONS,
      selection: 'single',
      value: library.sort,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <SearchField
        ariaLabel={translate('searchLabel', { category })}
        className="shrink-0"
        onSearch={library.onSearchChange}
        placeholder={translate('searchPlaceholder', { category })}
        value={library.search}
      >
        <FilterMenu
          clearLabel={translate('clearFilters')}
          facets={facets}
          isAttached
          label={translate('filters')}
          onClear={library.onClearFilters}
        />
      </SearchField>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        data-testid="gallery-library-scroll"
      >
        <InfiniteScroll
          hasMore={library.hasMore}
          isLoading={library.isLoadingMore}
          onLoadMore={library.loadMore}
        >
          <IngredientsMediaGrid
            emptyLabel={translate('empty', { category })}
            isLoading={library.isLoading}
            isTimeGroupingEnabled={false}
            items={library.items}
            onClickIngredient={onToggleItem}
            onToggleSelection={onToggleItem}
            selectedIds={selectedIds}
          />
        </InfiniteScroll>
      </div>
    </div>
  );
}
