'use client';

import { IngredientsProvider } from '@contexts/content/ingredients-context/ingredients-context';
import { IngredientsHeaderProvider } from '@contexts/content/ingredients-header-context/ingredients-header-context';
import {
  LIBRARY_SHELF_LABELS,
  LibraryPlace,
  PageScope,
} from '@genfeedai/contracts';
import type { LibraryBrowserProps } from '@props/pages/library-browser.props';
import Container from '@ui/layout/container/Container';
import { Library } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  LIBRARY_PLACE_COPY,
  LIBRARY_SHELF_DESCRIPTIONS,
  LIBRARY_SORT_OPTIONS,
} from './library-browser.config';
import LibraryBrowserToolbar from './library-browser-toolbar';
import { useLibraryBrowser } from './use-library-browser';

/**
 * One browser behind every Library destination.
 *
 * Places and shelves are routes, so they arrive as props; type and folder are
 * filters, so they arrive in the query string. The list itself is the existing
 * ingredients engine pointed at the unified `GET /ingredients` endpoint — the
 * redesign changes what gets asked for, not how results are rendered.
 */
export default function LibraryBrowser({
  place,
  shelf,
  seededCategories,
  preset,
  scope = PageScope.BRAND,
  children,
}: LibraryBrowserProps) {
  const {
    categories,
    contextValue,
    handleCategoriesChange,
    handleClearCategories,
    handleRefresh,
    handleSearchChange,
    handleSortChange,
    handleUpload,
    handleViewModeChange,
    isRefreshing,
    search,
    sort,
    viewMode,
  } = useLibraryBrowser({ place, scope, seededCategories, shelf });

  const [headerMeta, setHeaderMeta] = useState<ReactNode>();

  const destination = useMemo(() => {
    const adaptDescription = (description: string) =>
      scope === PageScope.ORGANIZATION
        ? description.replace('this brand', 'this organization')
        : description;

    if (shelf) {
      return {
        description: adaptDescription(LIBRARY_SHELF_DESCRIPTIONS[shelf]),
        label: LIBRARY_SHELF_LABELS[shelf],
      };
    }

    if (preset) {
      return {
        ...preset,
        description: adaptDescription(preset.description),
      };
    }

    const placeCopy = LIBRARY_PLACE_COPY[place ?? LibraryPlace.ASSETS];

    return {
      ...placeCopy,
      description: adaptDescription(placeCopy.description),
    };
  }, [place, preset, scope, shelf]);

  const description = headerMeta ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{destination.description}</span>
      <span aria-hidden="true" className="text-foreground/50">
        •
      </span>
      <span className="text-foreground/70">{headerMeta}</span>
    </div>
  ) : (
    destination.description
  );

  // Stable identities — an inline object here re-renders (and remounts) the
  // whole list on every parent pass.
  const headerContextValue = useMemo(
    () => ({ headerMeta, setHeaderMeta }),
    [headerMeta],
  );

  return (
    <IngredientsHeaderProvider value={headerContextValue}>
      <IngredientsProvider value={contextValue}>
        <Container
          description={description}
          icon={Library}
          label={destination.label}
          right={
            <LibraryBrowserToolbar
              categories={categories}
              isRefreshing={isRefreshing}
              onCategoriesChange={handleCategoriesChange}
              onClearCategories={handleClearCategories}
              onRefresh={handleRefresh}
              onSearchChange={handleSearchChange}
              onSortChange={handleSortChange}
              onUpload={handleUpload}
              onViewModeChange={handleViewModeChange}
              search={search}
              searchPlaceholder={
                scope === PageScope.ORGANIZATION
                  ? 'Search organization assets'
                  : "Search this brand's assets"
              }
              sort={sort}
              sortOptions={[...LIBRARY_SORT_OPTIONS]}
              viewMode={viewMode}
            />
          }
        >
          {children}
        </Container>
      </IngredientsProvider>
    </IngredientsHeaderProvider>
  );
}
