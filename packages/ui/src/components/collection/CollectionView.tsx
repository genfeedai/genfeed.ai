import { ViewType } from '@genfeedai/contracts';
import type { CollectionViewProps } from '@genfeedai/props/ui/collection/collection.props';
import CollectionGrid from '@ui/collection/CollectionGrid';
import CollectionList from '@ui/collection/CollectionList';
import { COLLECTION_DEFAULT_SKELETON_COUNT } from '@ui/collection/collection.constants';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { ListRowsSkeleton } from '@ui/lists/list-row/ListRowsSkeleton';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';

/**
 * Renders one collection as a list or a grid. The skeleton mirrors the
 * active view, so switching views never reshapes the loading state.
 */
export default function CollectionView<TItem>({
  items,
  view,
  getItemKey,
  renderListItem,
  renderGridItem,
  maxColumns = 4,
  density = 'card',
  isLoading = false,
  skeletonCount = COLLECTION_DEFAULT_SKELETON_COUNT,
  emptyState,
  className,
  'data-testid': dataTestId,
}: CollectionViewProps<TItem>) {
  const translate = useTranslations('ui.collection');
  const isList = view === ViewType.LIST;

  if (isLoading) {
    return isList ? (
      <CollectionList className={className} data-testid={dataTestId}>
        <ListRowsSkeleton rows={skeletonCount} />
      </CollectionList>
    ) : (
      <CollectionGrid
        className={className}
        data-testid={dataTestId}
        density={density}
        maxColumns={maxColumns}
      >
        {Array.from({ length: skeletonCount }, (_, index) => (
          <SkeletonCard
            // biome-ignore lint/suspicious/noArrayIndexKey: Fixed layout slots have positional identity and no item state.
            key={`collection-skeleton-${index}`}
            label={translate('loadingItem')}
            showImage={false}
          />
        ))}
      </CollectionGrid>
    );
  }

  if (items.length === 0) {
    return emptyState ?? null;
  }

  if (isList) {
    return (
      <CollectionList className={className} data-testid={dataTestId}>
        {items.map((item, index) => (
          <Fragment key={getItemKey(item)}>
            {renderListItem(item, index)}
          </Fragment>
        ))}
      </CollectionList>
    );
  }

  return (
    <CollectionGrid
      className={className}
      data-testid={dataTestId}
      density={density}
      maxColumns={maxColumns}
    >
      {items.map((item, index) => (
        <Fragment key={getItemKey(item)}>
          {renderGridItem(item, index)}
        </Fragment>
      ))}
    </CollectionGrid>
  );
}
