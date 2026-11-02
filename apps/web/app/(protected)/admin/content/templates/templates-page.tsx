'use client';
import { ButtonVariant, ViewType } from '@genfeedai/contracts';
import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IContentTemplate } from '@genfeedai/contracts/interfaces/content/template-ui.interface';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import { TemplateService } from '@services/content/template.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import CollectionView from '@ui/collection/CollectionView';
import CollectionViewToggle from '@ui/collection/CollectionViewToggle';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { ListRow } from '@ui/lists/list-row/ListRow';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Alert } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useMemo } from 'react';
import SearchField from '@/components/content/search-field/SearchField';
import type { TemplateView } from '@/features/admin/props/templates.props';
import { useCollectionViewPreference } from '@/hooks/utils/use-collection-view-preference/use-collection-view-preference';
import { toTemplateView } from './template-view';

const EMPTY_TEMPLATES: IContentTemplate[] = [];

function TemplatesPageContent() {
  const t = useTranslations('pages.adminTemplates');
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const { view, setView } = useCollectionViewPreference({
    surface: 'admin.content.templates',
    defaultView: ViewType.LIST,
  });
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const currentPage = Number(searchParams.get('page')) || 1;
  const search = searchParams.get('q') ?? '';
  const setSearch = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParamsString);
      if (value) next.set('q', value);
      else next.delete('q');
      next.delete('page');
      const query = next.toString();
      replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, replace, searchParamsString],
  );

  // Cached per page and search: coming back to Templates paints the rows it
  // already has while it refreshes, and paging keeps the current rows on screen.
  const templatesQuery = usePagedAuthedQuery({
    keepPreviousDataWithin: ['admin', 'templates'],
    queryFn: async (service, signal) => {
      try {
        const data = await service.getTemplates(
          {
            includeSystem: true,
            limit: ITEMS_PER_PAGE,
            page: currentPage,
            ...(search ? { search } : {}),
          },
          signal,
        );
        return data ?? [];
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load templates', error);
        }
        throw error;
      }
    },
    queryKey: ['admin', 'templates', { page: currentPage, search }],
    service: (token: string) => TemplateService.getInstance(token),
  });
  const {
    errorUpdatedAt,
    isError: hasError,
    isLoading,
    refetch,
  } = templatesQuery;
  const templates = hasError ? EMPTY_TEMPLATES : templatesQuery.data?.items;
  const isRefreshing = templatesQuery.isFetching;
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  // One toast per failed read, after its retry, not one per attempt.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (hasError) {
      notificationsService.error(t('loadError'));
    }
  }, [errorUpdatedAt, hasError, notificationsService, t]);

  const items = useMemo(
    () => (templates ?? []).map(toTemplateView),
    [templates],
  );

  const facts = (template: TemplateView) => (
    <>
      {template.isSystem && <Badge variant="default">{t('system')}</Badge>}
      {template.isActive !== undefined && (
        <Badge variant={template.isActive ? 'success' : 'warning'}>
          {t(template.isActive ? 'active' : 'inactive')}
        </Badge>
      )}
      <span className="capitalize">
        {(template.category ?? t('uncategorized')).replace(/-/g, ' ')}
      </span>
      {template.key && <span className="font-mono">{template.key}</span>}
      {template.variableNames.length > 0 && (
        <span>
          {t('variables')}{' '}
          {template.variableNames.map((name) => `{{${name}}}`).join(', ')}
        </span>
      )}
    </>
  );
  const href = (template: TemplateView) =>
    `${APP_ROUTES.ADMIN.CONTENT.TEMPLATES}/${template.id}`;
  return (
    <AdminPageShell
      title={t('title')}
      icon={FileText}
      search={
        <SearchField
          ariaLabel={t('search')}
          onSearch={(value) => setSearch(value.trim())}
          placeholder={t('search')}
          value={search}
        />
      }
      views={<CollectionViewToggle view={view} onViewChange={setView} />}
      onRefresh={reload}
      isRefreshing={isRefreshing}
    >
      {hasError ? (
        <Alert variant="destructive">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t('loadError')}</span>
            <Button
              label={t('retry')}
              onClick={reload}
              variant={ButtonVariant.SECONDARY}
            />
          </div>
        </Alert>
      ) : (
        <CollectionView
          data-testid={
            view === ViewType.LIST ? 'templates-list' : 'templates-grid'
          }
          view={view}
          items={items}
          isLoading={isLoading}
          maxColumns={3}
          getItemKey={(template) => template.id}
          emptyState={<EmptyState title={t('empty')} />}
          renderListItem={(template) => (
            <ListRow
              density="compact"
              href={href(template)}
              ariaLabel={t('open', { name: template.title })}
              leading={
                <FileText className="size-4 shrink-0 text-muted-foreground" />
              }
              title={template.title}
              description={template.description}
              meta={facts(template)}
            />
          )}
          renderGridItem={(template) => (
            <Link
              href={href(template)}
              aria-label={t('open', { name: template.title })}
              className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card
                data-testid="template-card"
                isInteractive
                className="h-full"
                bodyClassName="flex h-full flex-col"
              >
                <h3 className="text-sm font-semibold">{template.title}</h3>
                {template.description && (
                  <p className="text-sm text-muted-foreground">
                    {template.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {facts(template)}
                </div>
                <span className="mt-auto text-sm font-medium">
                  {t('details')}
                </span>
              </Card>
            </Link>
          )}
        />
      )}
      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel={t('totalLabel')}
          totals={templatesQuery.data?.totals}
        />
      </div>
    </AdminPageShell>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense fallback={null}>
      <TemplatesPageContent />
    </Suspense>
  );
}
