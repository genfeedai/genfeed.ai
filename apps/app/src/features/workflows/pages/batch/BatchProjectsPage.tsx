'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, formatEnumLabel, ViewType } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IBatchProject } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useCollectionViewPreference } from '@hooks/utils/use-collection-view-preference/use-collection-view-preference';
import Card from '@ui/card/Card';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import CollectionToolbar from '@ui/collection/CollectionToolbar';
import CollectionView from '@ui/collection/CollectionView';
import Container from '@ui/layout/container/Container';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { createBatchProjectsApi } from './batch-projects-api';

export default function BatchProjectsPage() {
  const t = useTranslations('pages.batchProjects');
  const locale = useLocale();
  const { brandId } = useBrand();
  const { href } = useOrgUrl();
  const service = useAuthedService(createBatchProjectsApi);
  const [projects, setProjects] = useState<IBatchProject[]>([]);
  const [page, setPage] = useState(1);
  const [loadedPage, setLoadedPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { view, setView } = useCollectionViewPreference({
    surface: 'studio.batch',
    defaultView: ViewType.LIST,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: changing brand resets pagination and loaded rows.
  useEffect(() => {
    setProjects([]);
    setPage(1);
    setLoadedPage(0);
  }, [brandId]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh explicitly retries the current page after a failed load.
  useEffect(() => {
    if (!brandId) return;
    const controller = new AbortController();
    setLoading(true);
    void service()
      .then((api) => api.list(brandId, page, controller.signal))
      .then((items) => {
        if (controller.signal.aborted) return;
        setProjects((current) =>
          page === 1
            ? items
            : [
                ...current,
                ...items.filter(
                  (item) => !current.some((prior) => prior.id === item.id),
                ),
              ],
        );
        setLoadedPage(page);
        setHasMore(items.length === 50);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : t('loadFailed'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [brandId, page, service, t, refresh]);
  async function remove(id: string) {
    try {
      await (await service()).remove(id);
      setProjects((items) => items.filter((item) => item.id !== id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('saveFailed'));
    }
  }
  function actions(project: IBatchProject) {
    return (
      <CollectionItemActions
        primary={
          <Button asChild variant={ButtonVariant.SECONDARY}>
            <Link href={href(`${APP_ROUTES.STUDIO.BATCH}/${project.id}`)}>
              {t('open')}
            </Link>
          </Button>
        }
        overflowLabel={t('actions', { name: project.name })}
        overflow={[
          {
            id: 'delete',
            label: t('delete'),
            isDestructive: true,
            onSelect: () => void remove(project.id),
          },
        ]}
      />
    );
  }
  function facts(project: IBatchProject) {
    return (
      <>
        <span>{formatEnumLabel(project.kind)}</span>
        <span>{formatEnumLabel(project.status)}</span>
        <span>{t('itemCount', { count: project.itemCounts.total })}</span>
        <span>
          {project.updatedAt
            ? new Date(project.updatedAt).toLocaleString(locale)
            : ''}
        </span>
      </>
    );
  }
  function row(project: IBatchProject) {
    return (
      <ListRow
        density="compact"
        title={project.name}
        meta={facts(project)}
        trailing={actions(project)}
      />
    );
  }
  const recent = [...projects]
    .sort(
      (a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? ''),
    )
    .slice(0, 5);
  return (
    <Container
      label={t('title')}
      right={
        <Button asChild>
          <Link href={href(APP_ROUTES.STUDIO.BATCH_NEW)}>{t('new')}</Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-8">
        {error && <p role="alert">{error}</p>}
        {!loading && !projects.length && !error && <p>{t('empty')}</p>}
        <CollectionSection title={t('recent')} itemCount={recent.length}>
          <CollectionList>
            {recent.map((project) => (
              <div key={project.id}>{row(project)}</div>
            ))}
          </CollectionList>
        </CollectionSection>
        <CollectionSection
          title={t('all')}
          itemCount={projects.length}
          isLoading={loading}
          actions={<CollectionToolbar view={view} onViewChange={setView} />}
        >
          <CollectionView
            items={projects}
            view={view}
            isLoading={loading && !projects.length}
            getItemKey={(project) => project.id}
            renderListItem={row}
            renderGridItem={(project) => (
              <Card label={project.name}>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {facts(project)}
                </div>
                {actions(project)}
              </Card>
            )}
          />
        </CollectionSection>
        {(hasMore || error) && (
          <Button
            isDisabled={loading}
            onClick={() => {
              const next = loadedPage + 1;
              if (page === next) setRefresh((value) => value + 1);
              else setPage(next);
            }}
          >
            {t(error ? 'retryLoad' : 'more')}
          </Button>
        )}
      </div>
    </Container>
  );
}
