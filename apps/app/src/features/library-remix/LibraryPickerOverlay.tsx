'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  AgentArtifactReference,
  IIngredient,
} from '@genfeedai/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { Tabs, TabsList, TabsTrigger } from '@ui/primitives/tabs';
import Link from 'next/link';
import { HiOutlineArrowRight, HiOutlineFolderOpen } from 'react-icons/hi2';
import { buildWorkspaceShellHref } from '@/lib/workspace-shell/workspace-shell-location';
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
  readonly threadId?: string | null;
};

function LibraryPickerSkeleton() {
  return (
    <div
      aria-label="Loading Library sources"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      role="status"
    >
      {Array.from({ length: 12 }, (_, index) => `source-${index + 1}`).map(
        (key) => (
          <Skeleton key={key} className="aspect-[4/3] w-full" />
        ),
      )}
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

  return <Alert type={AlertCategory.WARNING}>{message}</Alert>;
}

function LibrarySourceButton({
  ingredient,
  isValidating,
  onSelect,
}: {
  readonly ingredient: IIngredient;
  readonly isValidating: boolean;
  readonly onSelect: () => void;
}) {
  const label = getLibrarySourceLabel(ingredient);

  return (
    <Button
      ariaLabel={`Select ${label}`}
      className="group min-w-0 overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      isDisabled={isValidating}
      onClick={onSelect}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      <LibrarySourcePreview record={ingredient} />
      <span className="block truncate border-t border-border px-2.5 py-2 text-xs font-medium text-foreground">
        {isValidating ? 'Verifying source…' : label}
      </span>
    </Button>
  );
}

export default function LibraryPickerOverlay({
  onSelect,
  threadId,
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
  const managementHref = buildWorkspaceShellHref(
    href(APP_ROUTES.LIBRARY.ROOT),
    { threadId },
  );

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <Tabs
          onValueChange={(value) => setCategory(value as LibraryPickerCategory)}
          value={category}
        >
          <TabsList aria-label="Library media type">
            {LIBRARY_PICKER_CATEGORIES.map((candidate) => (
              <TabsTrigger key={candidate.key} value={candidate.key}>
                {candidate.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Link
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={managementHref}
        >
          Manage Library
          <HiOutlineArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>

      <div className="max-h-[min(58vh,34rem)] min-h-72 overflow-y-auto p-5">
        <SelectionFailure failure={selectionFailure} />

        {state.status === 'loading' ? <LibraryPickerSkeleton /> : null}

        {state.status === 'permission-denied' ? (
          <Alert type={AlertCategory.ERROR}>
            Library sources are unavailable for the effective brand. Your
            conversation context has not changed.
          </Alert>
        ) : null}

        {state.status === 'error' ? (
          <Alert type={AlertCategory.WARNING}>
            <div className="flex items-center justify-between gap-3">
              <span>Library sources could not be loaded.</span>
              <Button
                label="Retry"
                onClick={retry}
                size={ButtonSize.SM}
                variant={ButtonVariant.OUTLINE}
              />
            </div>
          </Alert>
        ) : null}

        {state.status === 'empty' ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
            <HiOutlineFolderOpen
              aria-hidden="true"
              className="size-8 text-muted-foreground"
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                No {category} available
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add media in full Library management, then return here.
              </p>
            </div>
          </div>
        ) : null}

        {state.status === 'ready' ? (
          <>
            <p className="sr-only" role="status">
              {state.total} Library sources available
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {state.items.map((ingredient) => (
                <LibrarySourceButton
                  ingredient={ingredient}
                  isValidating={isValidatingId === ingredient.id}
                  key={ingredient.id}
                  onSelect={() => void select(ingredient)}
                />
              ))}
            </div>
            {state.hasMore ? (
              <div className="flex justify-center pt-5">
                <Button
                  isDisabled={isLoadingMore}
                  label={isLoadingMore ? 'Loading more…' : 'Load more'}
                  onClick={loadMore}
                  variant={ButtonVariant.OUTLINE}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
