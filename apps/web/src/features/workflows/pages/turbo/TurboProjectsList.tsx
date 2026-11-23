'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { formatEnumLabel } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ITurboProject } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { viewerKeyPart } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useResetOnChange } from '@hooks/utils/use-reset-on-change/use-reset-on-change';
import {
  getJsonApiErrorMember,
  getJsonApiErrorMessage,
} from '@services/core/json-api-error-message';
import {
  type InfiniteData,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import SearchField from '@ui/content/search-field/SearchField';
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
import { useState } from 'react';
import SubscriptionRequiredState from '@/features/workflows/components/guards/subscription/SubscriptionRequiredState';
import type { TurboProjectsPage } from './turbo-project.types';
import { turboProjectListStatus } from './turbo-project-list-status';
import { createTurboProjectsApi } from './turbo-projects-api';

const PAGE_SIZE = 50;

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
  const { orgId, userId } = useAuthIdentity();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [removeError, setRemoveError] = useState<string | null>(null);
  useResetOnChange([brandId, search], () => setRemoveError(null));
  const queryKey = [
    'turbo-projects',
    brandId,
    search,
    viewerKeyPart(userId, orgId),
  ];
  const query = useInfiniteQuery({
    enabled: Boolean(brandId && userId),
    getNextPageParam: (last: TurboProjectsPage, _all, lastPage: number) =>
      last.hasMore ? lastPage + 1 : undefined,
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }): Promise<TurboProjectsPage> => {
      const items = await (await service()).list(
        brandId,
        pageParam,
        signal,
        search,
      );
      return { hasMore: items.length === PAGE_SIZE, items };
    },
    queryKey,
  });
  const projects = [
    ...new Map(
      (query.data?.pages ?? []).flatMap((page) =>
        page.items.map((item) => [item.id, item] as const),
      ),
    ).values(),
  ];
  const hasMore = query.hasNextPage;
  const loading = query.isFetching || query.isPending;
  const member = getJsonApiErrorMember(query.error);
  const isSubscriptionRequired =
    member?.status === 403 && member.title === 'Active subscription required';
  const error =
    removeError ??
    (query.isError
      ? getJsonApiErrorMessage(query.error, t('loadFailed'))
      : null);
  async function remove(id: string) {
    setRemoveError(null);
    try {
      await (await service()).remove(id);
      queryClient.setQueryData<InfiniteData<TurboProjectsPage, number>>(
        queryKey,
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => item.id !== id),
            })),
          },
      );
    } catch (reason) {
      setRemoveError(getJsonApiErrorMessage(reason, t('saveFailed')));
    }
  }
  function row(project: ITurboProject, now: Date) {
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
        time={formatThreadTime(project.updatedAt, locale, now)}
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
            setRemoveError(null);
            void query.refetch();
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
              setRemoveError(null);
              if (query.isFetchNextPageError || (!query.isError && hasMore)) {
                void query.fetchNextPage();
              } else {
                void query.refetch();
              }
            }}
          >
            {t(error ? 'retryLoad' : 'more')}
          </Button>
        )}
      </div>
    </Container>
  );
}
