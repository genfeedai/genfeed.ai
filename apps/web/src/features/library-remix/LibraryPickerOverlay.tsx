'use client';

import {
  ButtonSize,
  ButtonVariant,
  formatEnumLabel,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  AgentArtifactReference,
  IIngredient,
} from '@genfeedai/contracts/interfaces';
import type { LibraryGridItem } from '@genfeedai/props/ui/content/library-picker.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import LibraryGrid from '@ui/content/library-picker/LibraryGrid';
import OrderedMasonry from '@ui/display/masonry/OrderedMasonry';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { Skeleton } from '@ui/primitives/skeleton';
import { Tabs } from '@ui/primitives/tabs';
import { ArrowRight, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import LibrarySourcePreview, {
  getLibrarySourceLabel,
} from './LibrarySourcePreview';
import {
  LIBRARY_PICKER_CATEGORIES,
  type LibraryPickerCategory,
  useLibraryPicker,
} from './use-library-picker';

type LibraryPickerOverlayProps = {
  readonly onSelect: (reference: AgentArtifactReference) => void;
};

function LibraryPickerSkeleton() {
  return (
    <div aria-label="Loading Library sources" role="status">
      <OrderedMasonry maxColumns={3} minColumnWidth={150}>
        {Array.from({ length: 12 }, (_, index) => `source-${index + 1}`).map(
          (key) => (
            <Skeleton key={key} className="aspect-[4/3] w-full" />
          ),
        )}
      </OrderedMasonry>
    </div>
  );
}

function SelectionFailure({
  failure,
}: {
  readonly failure: ReturnType<typeof useLibraryPicker>['selectionFailure'];
}) {
  if (!failure) {
    return null;
  }

  const message =
    failure === 'stale'
      ? 'That source is no longer available. Your conversation and picker state were preserved.'
      : failure === 'unauthorized'
        ? 'That source is not available to the effective brand. Choose another source or open Library management.'
        : 'The source could not be verified. Retry without losing your current context.';

  return <Alert variant="warning">{message}</Alert>;
}

function toGridItem(ingredient: IIngredient): LibraryGridItem {
  return {
    aspectRatio: 4 / 3,
    id: ingredient.id,
    kind: formatEnumLabel(ingredient.category) ?? 'Asset',
    title: getLibrarySourceLabel(ingredient),
  };
}

export default function LibraryPickerOverlay({
  onSelect,
}: LibraryPickerOverlayProps) {
  const { href } = useOrgUrl();
  const {
    category,
    isLoadingMore,
    isValidatingId,
    loadMore,
    retry,
    select,
    selectionFailure,
    setCategory,
    state,
  } = useLibraryPicker({ onSelect });
  const managementHref = href(APP_ROUTES.LIBRARY.ROOT);
  const gridItems = useMemo(
    () => (state.status === 'ready' ? state.items.map(toGridItem) : []),
    [state],
  );

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <Tabs
          activeTab={category}
          ariaLabel="Library media type"
          fullWidth={false}
          items={LIBRARY_PICKER_CATEGORIES.map((candidate) => ({
            id: candidate.key,
            label: candidate.label,
          }))}
          onTabChange={(value) => setCategory(value as LibraryPickerCategory)}
        />
        <Link
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          href={managementHref}
        >
          Manage Library
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>

      <div className="max-h-[min(58vh,34rem)] min-h-72 overflow-y-auto p-5">
        <SelectionFailure failure={selectionFailure} />

        {state.status === 'loading' ? <LibraryPickerSkeleton /> : null}

        {state.status === 'permission-denied' ? (
          <Alert variant="destructive">
            Library sources are unavailable for the effective brand. Your
            conversation context has not changed.
          </Alert>
        ) : null}

        {state.status === 'error' ? (
          <Alert variant="warning">
            <div className="flex items-center justify-between gap-3">
              <span>Library sources could not be loaded.</span>
              <Button
                label="Retry"
                onClick={retry}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              />
            </div>
          </Alert>
        ) : null}

        {state.status === 'empty' ? (
          <EmptyState
            className="min-h-56"
            description="Add media in full Library management, then return here."
            icon={FolderOpen}
            title={`No ${category} available`}
          />
        ) : null}

        {state.status === 'ready' ? (
          <>
            <p className="sr-only" role="status">
              {state.total} Library sources available
            </p>
            <LibraryGrid
              ariaLabel="Library sources"
              getItemAriaLabel={(item) =>
                isValidatingId === item.id
                  ? `Verifying ${item.title}`
                  : `Select ${item.title}`
              }
              items={gridItems}
              onSelect={(item) => {
                const ingredient = state.items.find((i) => i.id === item.id);
                if (ingredient && isValidatingId === null) {
                  void select(ingredient);
                }
              }}
              renderPreview={(item) => {
                const ingredient = state.items.find((i) => i.id === item.id);
                return ingredient ? (
                  <LibrarySourcePreview
                    className="size-full"
                    record={ingredient}
                  />
                ) : null;
              }}
            />
            {state.hasMore ? (
              <div className="flex justify-center pt-5">
                <Button
                  isDisabled={isLoadingMore}
                  label={isLoadingMore ? 'Loading more…' : 'Load more'}
                  onClick={loadMore}
                  variant={ButtonVariant.SECONDARY}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
