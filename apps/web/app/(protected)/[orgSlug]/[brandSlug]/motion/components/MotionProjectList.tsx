'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, formatEnumLabel } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import CollectionList from '@ui/collection/CollectionList';
import Container from '@ui/layout/container/Container';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactElement, useState } from 'react';
import SearchField from '@/components/content/search-field/SearchField';
import { useVisualProjects } from '@/hooks/data/content/use-visual-projects';

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
      <div className="flex flex-col gap-4">
        {projects.error ? <p role="alert">{projects.error.message}</p> : null}
        {projects.isLoading ? <p role="status">{t('loading')}</p> : null}
        {isEmpty && query ? <p>{t('emptySearch')}</p> : null}
        {isEmpty && !query ? (
          <EmptyState
            description={t('emptyDescription')}
            title={t('emptyTitle')}
          />
        ) : null}
        {visible.length > 0 ? (
          <CollectionList>
            {visible.map((item) => {
              const status = item.revisions?.[0]?.status;
              return (
                <ListRow
                  density="compact"
                  href={`${href(APP_ROUTES.STUDIO.MOTION)}/${encodeURIComponent(item.id)}`}
                  key={item.id}
                  meta={
                    <>
                      <span>
                        {t('revision', { number: item.currentRevision })}
                      </span>
                      <span>
                        {item.updatedAt
                          ? new Date(item.updatedAt).toLocaleString(locale)
                          : ''}
                      </span>
                    </>
                  }
                  title={item.label}
                  trailing={
                    status ? (
                      <Badge status={status.toLowerCase()}>
                        {formatEnumLabel(status)}
                      </Badge>
                    ) : undefined
                  }
                />
              );
            })}
          </CollectionList>
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
