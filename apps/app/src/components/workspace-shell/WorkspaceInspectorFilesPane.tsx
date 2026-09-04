'use client';

import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import Alert from '@ui/feedback/alert/Alert';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import { FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import LibrarySourcePreview, {
  getLibrarySourceLabel,
} from '@/features/library-remix/LibrarySourcePreview';
import {
  LIBRARY_PICKER_CATEGORIES,
  useLibraryPicker,
} from '@/features/library-remix/use-library-picker';
import { dispatchOpenBrowserTab } from '@/lib/workspace/agent-composer-events';

import { useWorkspaceInspectorPreview } from './WorkspaceInspectorPreviewContext';

function FilesPaneSkeleton() {
  const translate = useTranslations('common.workspaceInspector.filesPane');

  return (
    <div
      aria-label={translate('loading')}
      className="grid grid-cols-2 gap-2"
      role="status"
    >
      {Array.from({ length: 8 }, (_, index) => `file-${index + 1}`).map(
        (key) => (
          <Skeleton key={key} className="aspect-[4/3] w-full" />
        ),
      )}
    </div>
  );
}

function FilesSourceButton({
  ingredient,
  isValidating,
  onSelect,
}: {
  readonly ingredient: IIngredient;
  readonly isValidating: boolean;
  readonly onSelect: () => void;
}) {
  const translate = useTranslations('common.workspaceInspector.filesPane');
  const label = getLibrarySourceLabel(ingredient);

  return (
    <Button
      ariaLabel={translate('select', { label })}
      className="group min-w-0 overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      isDisabled={isValidating}
      onClick={onSelect}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      <LibrarySourcePreview record={ingredient} />
      <span className="block truncate border-t border-border px-2 py-1.5 text-xs font-medium text-foreground">
        {isValidating ? translate('verifying') : label}
      </span>
    </Button>
  );
}

export default function WorkspaceInspectorFilesPane() {
  const translate = useTranslations('common.workspaceInspector.filesPane');
  const { href } = useOrgUrl();
  const { setPreview } = useWorkspaceInspectorPreview();
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
  } = useLibraryPicker({
    onSelect: (reference, record) => {
      setPreview({ record, reference });
      dispatchOpenBrowserTab();
    },
  });
  const managementHref = href(
    category === 'videos'
      ? APP_ROUTES.LIBRARY.VIDEOS
      : category === 'gifs'
        ? APP_ROUTES.LIBRARY.GIFS
        : APP_ROUTES.LIBRARY.IMAGES,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <Tabs
          activeTab={category}
          ariaLabel={translate('categoryAria')}
          fullWidth={false}
          items={LIBRARY_PICKER_CATEGORIES.map((candidate) => ({
            id: candidate.key,
            label: translate(candidate.key),
          }))}
          onTabChange={(value) =>
            setCategory(
              value as (typeof LIBRARY_PICKER_CATEGORIES)[number]['key'],
            )
          }
        />
        <Button
          asChild
          className="shrink-0 text-xs font-medium"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <Link href={managementHref}>{translate('manage')}</Link>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selectionFailure === 'stale' ? (
          <Alert type={AlertCategory.WARNING}>{translate('stale')}</Alert>
        ) : null}
        {selectionFailure === 'unauthorized' ? (
          <Alert type={AlertCategory.WARNING}>
            {translate('unauthorized')}
          </Alert>
        ) : null}
        {selectionFailure === 'error' ? (
          <Alert type={AlertCategory.WARNING}>{translate('verifyError')}</Alert>
        ) : null}

        {state.status === 'loading' ? <FilesPaneSkeleton /> : null}

        {state.status === 'permission-denied' ? (
          <Alert type={AlertCategory.ERROR}>
            {translate('permissionDenied')}
          </Alert>
        ) : null}

        {state.status === 'error' ? (
          <Alert type={AlertCategory.WARNING}>
            <div className="flex items-center justify-between gap-3">
              <span>{translate('error')}</span>
              <Button
                label={translate('retry')}
                onClick={retry}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              />
            </div>
          </Alert>
        ) : null}

        {state.status === 'empty' ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
            <FolderOpen
              aria-hidden="true"
              className="size-8 text-muted-foreground"
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                {translate('empty', { category })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {translate('emptyHint')}
              </p>
            </div>
          </div>
        ) : null}

        {state.status === 'ready' ? (
          <>
            <p className="sr-only" role="status">
              {translate('sourcesAvailable', { count: state.total })}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {state.items.map((ingredient) => (
                <FilesSourceButton
                  ingredient={ingredient}
                  isValidating={isValidatingId === ingredient.id}
                  key={ingredient.id}
                  onSelect={() => void select(ingredient)}
                />
              ))}
            </div>
            {state.hasMore ? (
              <div className="flex justify-center pt-4">
                <Button
                  isDisabled={isLoadingMore}
                  label={
                    isLoadingMore
                      ? translate('loadingMore')
                      : translate('loadMore')
                  }
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
