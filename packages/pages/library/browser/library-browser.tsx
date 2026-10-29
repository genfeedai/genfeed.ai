'use client';

import { IngredientsProvider } from '@contexts/content/ingredients-context/ingredients-context';
import { IngredientsHeaderProvider } from '@contexts/content/ingredients-header-context/ingredients-header-context';
import {
  ComponentSize,
  LIBRARY_SHELF_LABELS,
  LibraryPlace,
  LibraryShelf,
  PageScope,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useLibrarySummary } from '@hooks/data/library/use-library-summary';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { LibraryBrowserProps } from '@props/pages/library-browser.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AdminOrgBrandUrlFilter from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import Container from '@ui/layout/container/Container';
import FormSearchbar from '@ui/primitives/searchbar';
import { useLibraryTags } from '@ui/tags/library-tag-picker/use-library-tags';
import { Library } from 'lucide-react';
import { useMemo, useState } from 'react';
import LibraryActiveFilters from './library-active-filters';
import {
  LIBRARY_PLACE_COPY,
  LIBRARY_SORT_OPTIONS,
} from './library-browser.config';
import LibraryBrowserToolbar, {
  LibraryBrowserIconActions,
} from './library-browser-toolbar';
import { useLibraryBrowser } from './use-library-browser';
import { useLibraryCharacterOptions } from './use-library-character-options';

/**
 * One browser behind every Library destination.
 *
 * Places, shelves, type and folder are query filters; legacy props provide
 * defaults only when the URL does not specify them. The list itself is the existing
 * ingredients engine pointed at the unified `GET /ingredients` endpoint — the
 * redesign changes what gets asked for, not how results are rendered.
 *
 * `PageScope.SUPERADMIN` is the admin Library: every organization, narrowed by
 * the organization and brand pickers (`?organization=`, `?brand=`). It has the
 * type routes and the filters, but no shelves, places, upload or tag manager.
 */
export default function LibraryBrowser({
  place: defaultPlace,
  shelf: defaultShelf,
  seededCategories,
  seededOrigins,
  preset,
  scope = PageScope.BRAND,
  children,
}: LibraryBrowserProps) {
  const {
    place,
    shelf,
    categories,
    characters,
    contextValue,
    handleCategoriesChange,
    handleCharactersChange,
    handleClearAllFilters,
    handleOriginsChange,
    handlePlaceChange,
    handleRefresh,
    handleSearchChange,
    handleSortChange,
    handleStatusChange,
    handleTagMatchChange,
    handleTagsChange,
    handleUpload,
    handleViewModeChange,
    isRefreshing,
    origins,
    search,
    sort,
    tagMatch,
    tags,
    viewMode,
  } = useLibraryBrowser({
    place: defaultPlace,
    scope,
    seededCategories,
    seededOrigins,
    shelf: defaultShelf,
  });

  const isAdminScope = scope === PageScope.SUPERADMIN;

  // Character availability is resolved for one brand, so the filter belongs to
  // brand-scoped views only.
  const { brandId } = useCollectionScope();
  const { href } = useOrgUrl();
  const reviewUnsortedHref =
    shelf === LibraryShelf.UNSORTED && scope === PageScope.BRAND
      ? href(
          `${APP_ROUTES.AGENT.NEW}?agentMode=manual&prompt=${encodeURIComponent(`Use list_assets with shelf=unsorted and origin=GENERATED, paginating each supported media type for the current brand. Review those unsorted generated assets. Check the actual media against the approved brand kit, especially logo fidelity. Suggest approve/reject decisions with reasons and folders or tags for sorting. Use the available review tools; disclose any unavailable checks. Do not approve, reject, move, delete, publish, generate, or change learning settings. Return suggestions for me to review.`)}`,
        )
      : undefined;
  const { summary } = useLibrarySummary({ isEnabled: !isAdminScope });
  const characterOptions = useLibraryCharacterOptions({
    brandId,
    isEnabled: scope === PageScope.BRAND,
  });

  // Tags are listed for one brand (its own plus organization-wide), never
  // across brands, so the filter can only offer what the list can match.
  const { tags: tagOptions } = useLibraryTags({
    brandId: brandId || undefined,
    isEnabled: !isAdminScope,
  });

  const [selectionSlot, setSelectionSlot] = useState<HTMLElement | null>(null);
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null);
  const isRecoveryView =
    shelf === LibraryShelf.FAILED && scope === PageScope.BRAND;

  const destination = useMemo(() => {
    if (shelf) {
      return { label: LIBRARY_SHELF_LABELS[shelf] };
    }

    if (preset) {
      return { label: preset.label };
    }

    return { label: LIBRARY_PLACE_COPY[place ?? LibraryPlace.ASSETS].label };
  }, [place, preset, shelf]);

  // Stable identities — an inline object here re-renders (and remounts) the
  // whole list on every parent pass.
  const headerContextValue = useMemo(
    () => ({
      actionSlot,
      hostsSelectionActions: true,
      selectionSlot,
    }),
    [actionSlot, selectionSlot],
  );

  return (
    <IngredientsHeaderProvider value={headerContextValue}>
      <IngredientsProvider value={contextValue}>
        <Container
          className="@container/library"
          icon={Library}
          isTopbarPinned
          label={destination.label}
          titleVisibility="sr-only"
          leading={
            <FormSearchbar
              isCollapsible
              onSearch={handleSearchChange}
              placeholder={
                isAdminScope
                  ? 'Search all assets'
                  : scope === PageScope.ORGANIZATION
                    ? 'Search organization assets'
                    : "Search this brand's assets"
              }
              size={ComponentSize.SM}
              value={search}
            />
          }
          right={
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {/* Subbar order: the organization picker first, then filters. */}
              {isAdminScope ? <AdminOrgBrandUrlFilter /> : null}
              <LibraryBrowserToolbar
                isAdminScope={isAdminScope}
                isRecoveryView={isRecoveryView}
                categories={categories}
                characterOptions={characterOptions}
                characters={characters}
                onCategoriesChange={handleCategoriesChange}
                onCharactersChange={handleCharactersChange}
                onClearAllFilters={handleClearAllFilters}
                onOriginsChange={handleOriginsChange}
                onPlaceChange={handlePlaceChange}
                onStatusChange={handleStatusChange}
                origins={origins}
                place={place}
                shelf={shelf}
                shelfCounts={summary?.byShelf}
                trashedCount={summary?.trashedCount}
                onSortChange={handleSortChange}
                onTagMatchChange={handleTagMatchChange}
                onTagsChange={handleTagsChange}
                onViewModeChange={handleViewModeChange}
                sort={sort}
                sortOptions={[...LIBRARY_SORT_OPTIONS]}
                tagMatch={tagMatch}
                tagOptions={tagOptions}
                tags={tags}
                viewMode={viewMode}
              />
              {isRecoveryView ? (
                <div
                  className="empty:hidden"
                  ref={setActionSlot}
                  data-testid="library-recovery-action-slot"
                />
              ) : null}
            </div>
          }
          iconActionsPlacement="before-controls"
          refresh={
            <ButtonRefresh
              isRefreshing={isRefreshing}
              onClick={handleRefresh}
            />
          }
          iconActions={
            isAdminScope ? undefined : (
              <LibraryBrowserIconActions
                reviewUnsortedHref={reviewUnsortedHref}
                onUpload={handleUpload}
              />
            )
          }
          topbarFooter={
            <>
              <LibraryActiveFilters
                categories={categories}
                characterOptions={characterOptions}
                characters={characters}
                onCategoriesChange={handleCategoriesChange}
                onCharactersChange={handleCharactersChange}
                onClearAllFilters={handleClearAllFilters}
                onOriginsChange={handleOriginsChange}
                onPlaceChange={handlePlaceChange}
                onStatusChange={handleStatusChange}
                onTagMatchChange={handleTagMatchChange}
                onTagsChange={handleTagsChange}
                origins={origins}
                place={place}
                shelf={shelf}
                shelfCounts={summary?.byShelf}
                tagMatch={tagMatch}
                tagOptions={tagOptions}
                tags={tags}
                trashedCount={summary?.trashedCount}
              />
              <div
                className="empty:hidden"
                data-testid="library-selection-slot"
                ref={setSelectionSlot}
              />
            </>
          }
        >
          {children}
        </Container>
      </IngredientsProvider>
    </IngredientsHeaderProvider>
  );
}
