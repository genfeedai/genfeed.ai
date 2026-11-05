'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { formatEnumLabel } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ITurboProject } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  getJsonApiErrorMember,
  getJsonApiErrorMessage,
} from '@services/core/json-api-error-message';
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
import { Rocket } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import SearchField from '@/components/content/search-field/SearchField';
import SubscriptionRequiredState from '@/features/workflows/components/guards/subscription/SubscriptionRequiredState';
import { turboProjectListStatus } from './turbo-project-list-status';
import { createTurboProjectsApi } from './turbo-projects-api';

/**
 * The right side of the Turbo workspace while no project is open: one list of
 * the brand's projects. A row opens the project; creating one happens in the
 * prompt on the left.
 */
export default function TurboProjectsList() {
  const t = useTranslations('pages.turboProjects');
  const locale = useLocale();
  const { brandId } = useBrand();
  const { href, orgHref } = useOrgUrl();
  const service = useAuthedService(createTurboProjectsApi);
  const [projects, setProjects] = useState<ITurboProject[]>([]);
  const [page, setPage] = useState(1);
  const [loadedPage, setLoadedPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: changing brand resets pagination and loaded rows.
  useEffect(() => {
    setProjects([]);
    setPage(1);
    setLoadedPage(0);
    setError(null);
    setIsSubscriptionRequired(false);
  }, [brandId, search]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh explicitly retries the current page after a failed load.
  useEffect(() => {
    if (!brandId) return;
    const controller = new AbortController();
    setLoading(true);
    void service()
      .then((api) => api.list(brandId, page, controller.signal, search))
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
        setIsSubscriptionRequired(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        const member = getJsonApiErrorMember(reason);
        setIsSubscriptionRequired(
          member?.status === 403 &&
            member.title === 'Active subscription required',
        );
        setError(getJsonApiErrorMessage(reason, t('loadFailed')));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [brandId, page, search, service, t, refresh]);
  async function remove(id: string) {
    try {
      await (await service()).remove(id);
      setProjects((items) => items.filter((item) => item.id !== id));
    } catch (reason) {
      setError(getJsonApiErrorMessage(reason, t('saveFailed')));
    }
  }
  function row(project: ITurboProject) {
    return (
      <ThreadListRow
        actions={[
          {
            id: 'delete',
            isDestructive: true,
            label: t('delete'),
            onSelect: () => void remove(project.id),
          },
        ]}
        actionsLabel={t('actions', { name: project.name })}
        href={href(`${APP_ROUTES.STUDIO.TURBO}/${project.id}`)}
        status={turboProjectListStatus(project.status)}
        statusLabel={formatEnumLabel(project.status)}
        subtitle={
          <ThreadListSubtitle
            parts={[
              formatEnumLabel(project.kind),
              t('itemCount', { count: project.itemCounts.total }),
            ]}
          />
        }
        time={formatThreadTime(project.updatedAt, locale)}
        title={project.name}
      />
    );
  }
  const isSearching = search.trim() !== '';
  const isEmpty = !loading && !projects.length && !error;
  useCreativeProjectsPresence(
    projects.length > 0 || hasMore
      ? 'populated'
      : isEmpty && !isSearching && !isSubscriptionRequired
        ? 'empty'
        : 'unknown',
  );
  if (isSubscriptionRequired) {
    return (
      <Container label={t('title')} moduleChrome>
        <SubscriptionRequiredState
          message={error ?? t('loadFailed')}
          manageHref={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}
          manageLabel={t('manageSubscription')}
        />
      </Container>
    );
  }
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
          isRefreshing={loading}
          onClick={() => {
            if (page === 1) setRefresh((value) => value + 1);
            else setPage(1);
          }}
        />
      }
      titleVisibility="sr-only"
    >
      <div className="flex flex-col gap-2">
        {error && <p role="alert">{error}</p>}
        {isEmpty && isSearching ? (
          <CreativeProjectsEmptyState icon={Rocket} title={t('emptySearch')} />
        ) : null}
        {isEmpty && !isSearching ? (
          <CreativeProjectsEmptyState
            description={t('emptyDescription')}
            icon={Rocket}
            title={t('emptyTitle')}
          />
        ) : null}
        {projects.length > 0 ? (
          <ThreadListRecencySections
            getDate={(project) => project.updatedAt}
            getKey={(project) => project.id}
            items={projects}
            renderRow={row}
          />
        ) : null}
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
