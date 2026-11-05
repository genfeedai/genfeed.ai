'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, formatEnumLabel } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ThreadListStatus } from '@genfeedai/props/ui/lists/thread-list.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { useCreativeProjectsPresence } from '@ui/layout/creative-app-workspace/CreativeAppWorkspace';
import CreativeProjectsEmptyState from '@ui/layout/creative-app-workspace/CreativeProjectsEmptyState';
import { formatThreadTime } from '@ui/lists/thread-list/group-by-recency';
import {
  ThreadListRecencySections,
  ThreadListRow,
  ThreadListSubtitle,
} from '@ui/lists/thread-list/ThreadList';
import { Button } from '@ui/primitives/button';
import { SquarePlay } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactElement, useState } from 'react';
import SearchField from '@/components/content/search-field/SearchField';
import { useVisualProjects } from '@/hooks/data/content/use-visual-projects';

/** A failed render waits on the creator; a finished one is done. */
function motionStatus(status: string): ThreadListStatus {
  const normalised = status.toLowerCase();
  if (normalised === 'failed') return 'attention';
  if (normalised === 'completed') return 'done';
  return 'idle';
}

/**
 * The right side of the Motion workspace while no project is open: one list of
 * the brand's visual projects. A row opens the project; creating one happens
 * in the prompt on the left.
 */
export default function MotionProjectList(): ReactElement {
  const t = useTranslations('pages.studioMotion');
  const locale = useLocale();
  const { selectedBrand } = useBrand();
  const { href } = useOrgUrl();
  const { projects } = useVisualProjects({ brandId: selectedBrand?.id });
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const loaded = projects.data?.pages.flatMap((page) => page.projects) ?? [];
  const visible = query
    ? loaded.filter((item) => item.label.toLowerCase().includes(query))
    : loaded;
  const isEmpty = !projects.isLoading && !projects.error && !visible.length;
  const isLoaded = projects.isSuccess;
  // The list filters on the client, so what loaded is every project there is.
  useCreativeProjectsPresence(
    loaded.length > 0 ? 'populated' : isLoaded ? 'empty' : 'unknown',
  );

  return (
    <Container
      label={t('title')}
      leading={
        <SearchField
          ariaLabel={t('search')}
          onSearch={setSearch}
          placeholder={t('search')}
          value={search}
        />
      }
      moduleChrome
      refresh={
        <ButtonRefresh
          isRefreshing={projects.isFetching}
          onClick={() => void projects.refetch()}
        />
      }
      titleVisibility="sr-only"
    >
      <div className="flex flex-col gap-2">
        {projects.error ? <p role="alert">{projects.error.message}</p> : null}
        {projects.isLoading ? <p role="status">{t('loading')}</p> : null}
        {isEmpty && query ? (
          <CreativeProjectsEmptyState
            icon={SquarePlay}
            title={t('emptySearch')}
          />
        ) : null}
        {isEmpty && !query ? (
          <CreativeProjectsEmptyState
            description={t('emptyDescription')}
            icon={SquarePlay}
            title={t('emptyTitle')}
          />
        ) : null}
        {visible.length > 0 ? (
          <ThreadListRecencySections
            getDate={(item) => item.updatedAt}
            getKey={(item) => item.id}
            items={visible}
            renderRow={(item) => {
              const status = item.revisions?.[0]?.status;
              return (
                <ThreadListRow
                  href={`${href(APP_ROUTES.STUDIO.MOTION)}/${encodeURIComponent(item.id)}`}
                  status={status ? motionStatus(status) : 'idle'}
                  statusLabel={status ? formatEnumLabel(status) : undefined}
                  subtitle={
                    <ThreadListSubtitle
                      parts={[
                        t('revision', { number: item.currentRevision }),
                        status ? formatEnumLabel(status) : null,
                      ]}
                    />
                  }
                  time={formatThreadTime(item.updatedAt, locale)}
                  title={item.label}
                />
              );
            }}
          />
        ) : null}
        {projects.hasNextPage ? (
          <Button
            isDisabled={projects.isFetchingNextPage}
            onClick={() => void projects.fetchNextPage()}
            variant={ButtonVariant.GHOST}
          >
            {t('moreProjects')}
          </Button>
        ) : null}
      </div>
    </Container>
  );
}
