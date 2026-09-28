'use client';

import { AlertCategory, ButtonVariant, ViewType } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IContentTemplate } from '@genfeedai/contracts/interfaces/content/template-ui.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionViewPreference } from '@hooks/utils/use-collection-view-preference/use-collection-view-preference';
import { TemplateService } from '@services/content/template.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import CollectionToolbar from '@ui/collection/CollectionToolbar';
import CollectionView from '@ui/collection/CollectionView';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function TemplatesPage() {
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
  const [templates, setTemplates] = useState<IContentTemplate[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const loadTemplates = useCallback(async () => {
    setTemplates(null);
    setHasError(false);
    try {
      const service = await getTemplatesService();
      const data = (await service.getTemplates()) ?? [];
      setTemplates(data);
    } catch (error) {
      logger.error('Failed to load templates', error);
      notificationsService.error(t('loadError'));
      setHasError(true);
      setTemplates([]);
    }
  }, [getTemplatesService, notificationsService, t]);
  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const facts = (template: IContentTemplate) => (
    <>
      {template.isActive !== undefined && (
        <Badge variant={template.isActive ? 'success' : 'warning'}>
          {t(template.isActive ? 'active' : 'inactive')}
        </Badge>
      )}
      <span className="capitalize">
        {(template.category ?? t('uncategorized')).replace(/-/g, ' ')}
      </span>
      {template.metadata?.difficulty && (
        <span>{template.metadata.difficulty}</span>
      )}
      {template.performance?.usageCount !== undefined && (
        <span>{t('uses', { count: template.performance.usageCount })}</span>
      )}
      {template.variables.length > 0 && (
        <span>
          {t('variables')}{' '}
          {template.variables
            .map((variable) => `{{${variable.name}}}`)
            .join(', ')}
        </span>
      )}
    </>
  );
  const href = (template: IContentTemplate) =>
    `${APP_ROUTES.ADMIN.CONTENT.TEMPLATES}/${template.id}`;
  return (
    <Container
      label={t('title')}
      description={t('description')}
      icon={FileText}
    >
      <CollectionToolbar view={view} onViewChange={setView} />
      <WorkspaceSurface
        title={t('catalog')}
        tone="muted"
        data-testid="content-templates-surface"
      >
        {hasError ? (
          <Alert type={AlertCategory.ERROR}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{t('loadError')}</span>
              <Button
                label={t('retry')}
                onClick={loadTemplates}
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
            items={templates ?? []}
            isLoading={templates === null}
            maxColumns={3}
            getItemKey={(template) => template.id}
            emptyState={<CardEmptyContent label={t('empty')} />}
            renderListItem={(template) => (
              <ListRow
                density="compact"
                href={href(template)}
                ariaLabel={t('open', { name: template.name })}
                leading={
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                }
                title={template.name}
                description={template.description}
                meta={facts(template)}
              />
            )}
            renderGridItem={(template) => (
              <Link
                href={href(template)}
                aria-label={t('open', { name: template.name })}
                className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card
                  data-testid="template-card"
                  className="h-full group-hover:shadow-border-strong"
                  bodyClassName="flex h-full flex-col gap-3 p-4"
                >
                  <h3 className="text-sm font-semibold">{template.name}</h3>
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
      </WorkspaceSurface>
    </Container>
  );
}
