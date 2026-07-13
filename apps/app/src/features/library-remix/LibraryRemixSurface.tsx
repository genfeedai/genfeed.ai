'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/constants';
import {
  AlertCategory,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/enums';
import type { IAsset, IIngredient } from '@genfeedai/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { HiOutlineArrowRight, HiOutlineSparkles } from 'react-icons/hi2';
import { useWorkspaceShellActions } from '@/components/workspace-shell/WorkspaceShellActionsContext';
import { buildWorkspaceShellHref } from '@/lib/workspace-shell/workspace-shell-location';
import LibrarySourcePreview, {
  getLibrarySourceLabel,
} from './LibrarySourcePreview';
import { useLibraryRemixSource } from './use-library-remix-source';

type LibraryRemixSurfaceProps = {
  readonly sourceArtifact?: string | null;
  readonly threadId?: string | null;
};

function isIngredient(record: IAsset | IIngredient): record is IIngredient {
  return 'ingredientUrl' in record || 'scope' in record;
}

function getManagementRoute(record: IAsset | IIngredient): string {
  if (!isIngredient(record)) {
    return APP_ROUTES.LIBRARY.ROOT;
  }

  switch (record.category) {
    case IngredientCategory.VIDEO:
      return APP_ROUTES.LIBRARY.VIDEOS;
    case IngredientCategory.GIF:
      return APP_ROUTES.LIBRARY.GIFS;
    default:
      return APP_ROUTES.LIBRARY.IMAGES;
  }
}

export default function LibraryRemixSurface({
  sourceArtifact,
  threadId,
}: LibraryRemixSurfaceProps) {
  const { selectedBrand } = useBrand();
  const { href } = useOrgUrl();
  const shellActions = useWorkspaceShellActions();
  const { record, reference, retry, status } =
    useLibraryRemixSource(sourceArtifact);
  const openLibraryPicker = () =>
    shellActions?.openOverlay({
      key: 'library-picker',
      parameters: {},
    });
  const fullLibraryHref = buildWorkspaceShellHref(
    href(APP_ROUTES.LIBRARY.ROOT),
    { threadId },
  );

  if (!sourceArtifact) {
    return (
      <section
        aria-labelledby="library-remix-heading"
        className="mx-auto flex min-h-[55vh] max-w-2xl items-center px-6 py-12"
      >
        <div className="w-full space-y-5 text-center">
          <HiOutlineSparkles
            aria-hidden="true"
            className="mx-auto size-9 text-muted-foreground"
          />
          <div>
            <h1 id="library-remix-heading" className="text-2xl font-semibold">
              Start a Remix from Library
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Choose a scoped media source for{' '}
              {selectedBrand?.label || 'the effective brand'}. Full Library
              management remains available on its canonical route.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {shellActions ? (
              <Button
                label="Choose a source"
                onClick={openLibraryPicker}
                variant={ButtonVariant.PRIMARY}
              />
            ) : null}
            <Link
              className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={fullLibraryHref}
            >
              {shellActions ? 'Manage Library' : 'Choose in Library'}
              <HiOutlineArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (status === 'loading') {
    return (
      <div
        aria-label="Loading Remix source"
        className="mx-auto grid min-h-[55vh] max-w-4xl gap-6 px-6 py-12 md:grid-cols-[minmax(0,1fr)_18rem]"
        role="status"
      >
        <div className="space-y-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <Skeleton className="aspect-[4/3] w-full" />
      </div>
    );
  }

  if (status !== 'ready' || !record || !reference) {
    const message =
      status === 'permission-denied'
        ? 'This source is not authorized for the effective brand. The active thread and brand context were preserved.'
        : status === 'stale' || status === 'invalid'
          ? 'This Library source is stale or invalid. Choose another source without losing the active thread.'
          : 'The Remix source could not be loaded. Retry or choose another source.';

    return (
      <section className="mx-auto flex min-h-[55vh] max-w-2xl items-center px-6 py-12">
        <div className="w-full space-y-4">
          <Alert type={AlertCategory.WARNING}>{message}</Alert>
          <div className="flex flex-wrap gap-3">
            {status === 'error' ? (
              <Button
                label="Retry"
                onClick={retry}
                variant={ButtonVariant.OUTLINE}
              />
            ) : null}
            {shellActions ? (
              <Button
                label="Choose another source"
                onClick={openLibraryPicker}
                variant={ButtonVariant.PRIMARY}
              />
            ) : null}
            <Link
              className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={fullLibraryHref}
            >
              Open full Library
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const label = getLibrarySourceLabel(record);
  const managementHref = buildWorkspaceShellHref(
    href(getManagementRoute(record)),
    { threadId },
  );

  return (
    <section
      aria-labelledby="library-remix-heading"
      className="mx-auto grid min-h-[55vh] max-w-4xl items-center gap-8 px-6 py-12 md:grid-cols-[minmax(0,1fr)_18rem]"
    >
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Remix source ready
          </p>
          <h1
            id="library-remix-heading"
            className="mt-2 text-2xl font-semibold"
          >
            {label}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The canonical {reference.kind} reference is scoped to{' '}
            {selectedBrand?.label || 'the effective brand'}. Source media stays
            authoritative in Library while this focused Remix surface keeps the
            active thread connected.
          </p>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {reference.kind}:{reference.recordId}
        </p>
        <div className="flex flex-wrap gap-3">
          {shellActions ? (
            <Button
              label="Choose a different source"
              onClick={openLibraryPicker}
              variant={ButtonVariant.PRIMARY}
            />
          ) : null}
          <Link
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={managementHref}
          >
            Open source in Library
            <HiOutlineArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
      <LibrarySourcePreview
        className="shadow-border"
        record={record}
        reference={reference}
      />
    </section>
  );
}
