'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import MediaLightbox from '@ui/layouts/lightbox/MediaLightbox';
import { Alert, AlertActions, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import IngredientsMediaGrid from '@/components/ingredients/list/media-grid/IngredientsMediaGrid';
import type { OrganizationLibraryProps } from '@/features/admin/props/organization-library.props';
import InfiniteScroll from '@/features/ingredients/components/feedback/infinite-scroll/InfiniteScroll';
import { useOrganizationLibrary } from '../hooks/use-organization-library';

/**
 * What one organization has generated, as the same masonry the in-app Library
 * uses. Read-only: tile actions and selection stay off, a tile opens the
 * lightbox, and older assets stream in as the page scrolls.
 */
export default function OrganizationLibrary({
  organizationId,
}: OrganizationLibraryProps) {
  const translate = useTranslations('pages.adminOrganizations');
  const {
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchingNextPage,
    isLoading,
    items,
  } = useOrganizationLibrary(organizationId);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Every generated asset keeps its tile; one whose preview is unavailable
  // shows that state itself and just cannot open in the lightbox.
  const lightboxItems = useMemo(
    () => items.filter((item) => item.ingredientUrl || item.thumbnailUrl),
    [items],
  );

  const handleOpen = useCallback(
    (ingredient: IIngredient) => {
      const index = lightboxItems.findIndex(
        (item) => item.id === ingredient.id,
      );
      if (index >= 0) {
        setLightboxIndex(index);
      }
    },
    [lightboxItems],
  );

  // A failed first page is the whole page's error; a failed later page keeps
  // what already loaded and offers a retry below it.
  if (isError && items.length === 0) {
    return <Alert variant="destructive">{translate('libraryLoadError')}</Alert>;
  }

  return (
    <>
      <IngredientsMediaGrid
        emptyLabel={translate('libraryEmpty')}
        isLoading={isLoading}
        items={items}
        onClickIngredient={handleOpen}
      />
      {/* Older assets stream in a viewport and a half before the end. */}
      <InfiniteScroll
        enabled={!isLoading && !isError}
        hasMore={hasNextPage}
        isLoading={isFetchingNextPage}
        onLoadMore={() => {
          void fetchNextPage();
        }}
        rootMargin="0px 0px 1200px 0px"
      />
      {isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {translate('libraryLoadMoreError')}
          </AlertDescription>
          <AlertActions>
            <Button
              label={translate('libraryRetry')}
              variant={ButtonVariant.SECONDARY}
              onClick={() => {
                void fetchNextPage();
              }}
            />
          </AlertActions>
        </Alert>
      ) : null}
      {lightboxItems.length > 0 ? (
        <MediaLightbox
          items={lightboxItems}
          onClose={() => setLightboxIndex(null)}
          open={lightboxIndex !== null}
          startIndex={lightboxIndex ?? 0}
        />
      ) : null}
    </>
  );
}
