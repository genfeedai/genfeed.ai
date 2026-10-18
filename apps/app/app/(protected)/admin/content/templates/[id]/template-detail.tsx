'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IContentTemplate } from '@genfeedai/contracts/interfaces/content/template-ui.interface';
import { Pre } from '@genfeedai/ui';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TemplateDetailProps } from '@props/admin/templates.props';
import { TemplateService } from '@services/content/template.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toTemplateView } from '../template-view';
import { DetailCard, MetadataRow } from './template-detail-helpers';
import TemplateSidebar from './template-sidebar';
import TemplateVariablesCard from './template-variables-card';

export default function TemplateDetail({ templateId }: TemplateDetailProps) {
  const t = useTranslations('pages.adminTemplates');
  const { push } = useRouter();
  const notificationsService = NotificationsService.getInstance();

  const getTemplatesService = useAuthedService((token: string) =>
    TemplateService.getInstance(token),
  );

  const [template, setTemplate] = useState<IContentTemplate | null | undefined>(
    undefined,
  );

  const loadTemplate = useCallback(async () => {
    setTemplate(undefined);

    try {
      const service = await getTemplatesService();
      const data = await service.getTemplate(templateId);

      setTemplate(data);
      logger.info('Loaded template', { id: templateId });
    } catch (error) {
      logger.error('Failed to load template', error);
      notificationsService.error(t('detailLoadError'));
      push(APP_ROUTES.ADMIN.CONTENT.TEMPLATES);
    }
  }, [templateId, getTemplatesService, notificationsService, push, t]);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  const isLoading = template === undefined;
  const view = template ? toTemplateView(template) : undefined;

  return (
    <div
      className="min-h-screen bg-background/40 px-4 py-6 sm:px-6 lg:px-10"
      data-testid="template-detail-shell"
    >
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Heading size="2xl">
            {template ? toTemplateView(template).title : t('detailTemplate')}
          </Heading>
          {template?.isActive !== undefined && (
            <Badge variant={template.isActive ? 'success' : 'warning'}>
              {template.isActive ? t('active') : t('inactive')}
            </Badge>
          )}
          {template?.isPremium && (
            <Badge variant="primary">{t('detailPremium')}</Badge>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <SkeletonCard className="lg:col-span-2" showImage={false} />
          <SkeletonCard showImage={false} />
        </div>
      ) : !template ? (
        <Card>
          <div className="p-6">
            <Text color="subtle-70">{t('detailNotFound')}</Text>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <DetailCard title={t('detailOverview')}>
              {template.description && (
                <Text as="p" color="subtle-70">
                  {template.description}
                </Text>
              )}

              <div className="flex flex-wrap gap-2">
                {template.category && (
                  <Badge variant="outline" className="capitalize">
                    {template.category.replace(/-/g, ' ')}
                  </Badge>
                )}
                {template.type && (
                  <Badge variant="outline" className="capitalize">
                    {template.type}
                  </Badge>
                )}
                {(template.industry ?? []).map((ind) => (
                  <Badge key={ind} variant="outline" className="capitalize">
                    {ind.replace(/-/g, ' ')}
                  </Badge>
                ))}
                {(template.tags ?? []).map((tag) => (
                  <Badge key={tag} variant="ghost">
                    {tag}
                  </Badge>
                ))}
              </div>

              {template.metadata?.difficulty && (
                <Text size="sm" color="subtle-60">
                  <Text as="span" weight="medium">
                    {t('detailDifficulty')}{' '}
                  </Text>
                  <span className="capitalize">
                    {template.metadata.difficulty}
                  </span>
                </Text>
              )}
            </DetailCard>

            <TemplateVariablesCard variables={template.variables ?? []} />

            <DetailCard title={t('detailContent')}>
              <div className="flex flex-col gap-3">
                {view?.key && (
                  <MetadataRow label={t('detailKey')}>{view.key}</MetadataRow>
                )}
                {view?.body && (
                  <div>
                    <Text as="p" size="sm" weight="medium" className="mb-1">
                      {t('detailPrompt')}
                    </Text>
                    <Pre variant="debug" size="md" className="text-sm">
                      {view.body}
                    </Pre>
                  </div>
                )}
                {template.content?.style && (
                  <MetadataRow label={t('detailStyle')}>
                    {template.content?.style}
                  </MetadataRow>
                )}
                {template.content?.mood && (
                  <MetadataRow label={t('detailMood')}>
                    {template.content?.mood}
                  </MetadataRow>
                )}
                {template.content?.aspectRatio && (
                  <MetadataRow label={t('detailAspectRatio')}>
                    {template.content?.aspectRatio}
                  </MetadataRow>
                )}
                {template.content?.duration && (
                  <MetadataRow label={t('detailDuration')}>
                    {t('detailSeconds', {
                      count: template.content?.duration,
                    })}
                  </MetadataRow>
                )}
                {template.content?.structure && (
                  <Collapsible className="rounded-lg bg-tertiary">
                    <CollapsibleTrigger className="w-full cursor-pointer list-none px-4 py-3 text-left text-sm font-medium">
                      {t('detailStructure')}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 pb-4">
                      <Pre>
                        {JSON.stringify(template.content?.structure, null, 2)}
                      </Pre>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </DetailCard>
          </div>

          <TemplateSidebar
            metadata={template.metadata}
            performance={template.performance}
            createdAt={template.createdAt}
            updatedAt={template.updatedAt}
          />
        </div>
      )}
    </div>
  );
}
