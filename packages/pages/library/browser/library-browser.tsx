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
import Container from '@ui/layout/container/Container';
import FormSearchbar from '@ui/primitives/searchbar';
import { useLibraryTags } from '@ui/tags/library-tag-picker/use-library-tags';
import { Library } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  LIBRARY_PLACE_COPY,
  LIBRARY_SHELF_DESCRIPTIONS,
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
 */
export default function LibraryBrowser({
  place: defaultPlace,
  shelf: defaultShelf,
  seededCategories,
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
    handleClearCategories,
    handleClearCharacters,
    handleClearOrigins,
    handleClearTags,
    handleOriginsChange,
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
    shelf: defaultShelf,
  });

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
  const { summary } = useLibrarySummary();
  const characterOptions = useLibraryCharacterOptions({
    brandId,
    isEnabled: scope === PageScope.BRAND,
  });

  // Tags are listed for one brand (its own plus organization-wide), never
  // across brands, so the filter can only offer what the list can match.
  const { tags: tagOptions } = useLibraryTags({
    brandId: brandId || undefined,
  });

  const [headerMeta, setHeaderMeta] = useState<ReactNode>();
  const [selectionSlot, setSelectionSlot] = useState<HTMLElement | null>(null);
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null);
  const isRecoveryView =
    shelf === LibraryShelf.FAILED && scope === PageScope.BRAND;

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
    () => ({
      actionSlot,
      headerMeta,
      hostsSelectionActions: true,
      selectionSlot,
      setHeaderMeta,
    }),
    [actionSlot, headerMeta, selectionSlot],
  );

  return (
    <IngredientsHeaderProvider value={headerContextValue}>
      <IngredientsProvider value={contextValue}>
        <Container
          className="@container/library"
          description={isRecoveryView ? undefined : description}
          icon={Library}
          isTopbarPinned
          label={destination.label}
          titleVisibility="sr-only"
          leading={
            <FormSearchbar
              isCollapsible
              onSearch={handleSearchChange}
              placeholder={
                scope === PageScope.ORGANIZATION
                  ? 'Search organization assets'
                  : "Search this brand's assets"
              }
              size={ComponentSize.SM}
              value={search}
            />
          }
          right={
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <LibraryBrowserToolbar
                isRecoveryView={isRecoveryView}
                categories={categories}
                characterOptions={characterOptions}
                characters={characters}
                onCategoriesChange={handleCategoriesChange}
                onCharactersChange={handleCharactersChange}
                onClearCategories={handleClearCategories}
                onClearCharacters={handleClearCharacters}
                onClearOrigins={handleClearOrigins}
                onClearTags={handleClearTags}
                onOriginsChange={handleOriginsChange}
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
          iconActions={
            <LibraryBrowserIconActions
              reviewUnsortedHref={reviewUnsortedHref}
              isRefreshing={isRefreshing}
              onRefresh={handleRefresh}
              onUpload={handleUpload}
            />
          }
          topbarFooter={
            <div
              className="empty:hidden"
              data-testid="library-selection-slot"
              ref={setSelectionSlot}
            />
          }
        >
          {children}
        </Container>
      </IngredientsProvider>
    </IngredientsHeaderProvider>
  );
}
