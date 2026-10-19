'use client';

import {
  AlertCategory,
  ButtonVariant,
  ComponentSize,
  ViewType,
} from '@genfeedai/contracts';
import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IContentTemplate } from '@genfeedai/contracts/interfaces/content/template-ui.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionViewPreference } from '@hooks/utils/use-collection-view-preference/use-collection-view-preference';
import type { TemplateView } from '@props/admin/templates.props';
import { TemplateService } from '@services/content/template.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import CollectionToolbar from '@ui/collection/CollectionToolbar';
import CollectionView from '@ui/collection/CollectionView';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { ListRow } from '@ui/lists/list-row/ListRow';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { toTemplateView } from './template-view';

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
  const getTemplatesService = useAuthedService((token: string) =>
    TemplateService.getInstance(token),
  );
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const currentPage = Number(searchParams.get('page')) || 1;
  const search = searchParams.get('q') ?? '';
  const [templates, setTemplates] = useState<IContentTemplate[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

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

  const reload = useCallback(
    () => setReloadVersion((version) => version + 1),
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadVersion is the explicit refresh and retry trigger
  useEffect(() => {
    const controller = new AbortController();
    setTemplates(null);
    setHasError(false);
    void (async () => {
      try {
        const service = await getTemplatesService();
        const data = await service.getTemplates(
          {
            includeSystem: true,
            limit: ITEMS_PER_PAGE,
            page: currentPage,
            ...(search ? { search } : {}),
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setTemplates(data ?? []);
      } catch (error) {
        if (controller.signal.aborted) return;
        logger.error('Failed to load templates', error);
        notificationsService.error(t('loadError'));
        setHasError(true);
        setTemplates([]);
      }
    })();
    return () => controller.abort();
  }, [
    currentPage,
    getTemplatesService,
    notificationsService,
    reloadVersion,
    search,
    t,
  ]);

  const items = useMemo(
    () => (templates ?? []).map(toTemplateView),
    [templates],
  );

  const facts = (template: TemplateView) => (
    <>
      {template.isSystem && <Badge variant="primary">{t('system')}</Badge>}
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
        <div className="w-48 sm:w-64">
          <FormSearchbar
            ariaLabel={t('search')}
            onSearch={(value) => setSearch(value.trim())}
            placeholder={t('search')}
            size={ComponentSize.SM}
            value={search}
          />
        </div>
      }
      filters={<CollectionToolbar view={view} onViewChange={setView} />}
      onRefresh={reload}
      isRefreshing={templates === null}
    >
      {hasError ? (
        <Alert type={AlertCategory.ERROR}>
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
          isLoading={templates === null}
          maxColumns={3}
          getItemKey={(template) => template.id}
          emptyState={<CardEmptyContent label={t('empty')} />}
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
                className="h-full group-hover:shadow-border-strong"
                bodyClassName="flex h-full flex-col gap-3 p-4"
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
        <AutoPagination showTotal totalLabel={t('totalLabel')} />
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
