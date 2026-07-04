'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import type { IContentTemplate } from '@genfeedai/interfaces/content/template-ui.interface';
import { Pre } from '@genfeedai/ui';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TemplateDetailProps } from '@props/admin/templates.props';
import { TemplateService } from '@services/content/template.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { VStack } from '@ui/layout/stack';
import Breadcrumb from '@ui/navigation/breadcrumb/Breadcrumb';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DetailCard, MetadataRow } from './template-detail-helpers';
import TemplateSidebar from './template-sidebar';
import TemplateVariablesCard from './template-variables-card';

export default function TemplateDetail({ templateId }: TemplateDetailProps) {
  const { push } = useRouter();
  const pathname = usePathname();
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
      notificationsService.error('Failed to load template');
      push('/content/templates');
    }
  }, [templateId, getTemplatesService, notificationsService, push]);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  const isLoading = template === undefined;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background/40 px-4 py-6 sm:px-6 lg:px-10">
        <Breadcrumb
          segments={[
            { href: APP_ROUTES.ADMIN.CONTENT.TEMPLATES, label: 'Templates' },
            { href: pathname, label: 'Loading...' },
          ]}
        />
        <div className="grid gap-6 lg:grid-cols-3">
          <SkeletonCard className="lg:col-span-2" showImage={false} />
          <SkeletonCard showImage={false} />
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen bg-background/40 px-4 py-6 sm:px-6 lg:px-10">
        <Breadcrumb
          segments={[
            { href: APP_ROUTES.ADMIN.CONTENT.TEMPLATES, label: 'Templates' },
            { href: pathname, label: 'Not Found' },
          ]}
        />
        <Card>
          <div className="p-6">
            <Text color="subtle-70">
              The template you are looking for does not exist or has been
              deleted.
            </Text>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background/40 px-4 py-6 sm:px-6 lg:px-10">
      <Breadcrumb
        segments={[
          { href: APP_ROUTES.ADMIN.CONTENT.TEMPLATES, label: 'Templates' },
          { href: pathname, label: template.name },
        ]}
      />

      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Heading size="2xl">{template.name}</Heading>
          {template.isActive !== undefined && (
            <Badge variant={template.isActive ? 'success' : 'warning'}>
              {template.isActive ? 'Active' : 'Inactive'}
            </Badge>
          )}
          {template.isPremium && <Badge variant="primary">Premium</Badge>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <VStack gap={6} className="lg:col-span-2">
          {/* Overview Card */}
          <DetailCard title="Overview">
            {template.description && (
              <Text as="p" color="subtle-70">
                {template.description}
              </Text>
            )}

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="capitalize">
                {template.category.replace(/-/g, ' ')}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {template.type}
              </Badge>
              {template.industry.map((ind) => (
                <Badge key={ind} variant="outline" className="capitalize">
                  {ind.replace(/-/g, ' ')}
                </Badge>
              ))}
              {template.tags.map((tag) => (
                <Badge key={tag} variant="ghost">
                  {tag}
                </Badge>
              ))}
            </div>

            {template.metadata?.difficulty && (
              <Text size="sm" color="subtle-60">
                <Text as="span" weight="medium">
                  Difficulty:{' '}
                </Text>
                <span className="capitalize">
                  {template.metadata.difficulty}
                </span>
              </Text>
            )}
          </DetailCard>

          <TemplateVariablesCard variables={template.variables} />

          {/* Content Card */}
          <DetailCard title="Content">
            <VStack gap={3}>
              {template.content.prompt && (
                <div>
                  <Text as="p" size="sm" weight="medium" className="mb-1">
                    Prompt:
                  </Text>
                  <Pre variant="debug" size="md" className="text-sm">
                    {template.content.prompt}
                  </Pre>
                </div>
              )}
              {template.content.style && (
                <MetadataRow label="Style">
                  {template.content.style}
                </MetadataRow>
              )}
              {template.content.mood && (
                <MetadataRow label="Mood">{template.content.mood}</MetadataRow>
              )}
              {template.content.aspectRatio && (
                <MetadataRow label="Aspect Ratio">
                  {template.content.aspectRatio}
                </MetadataRow>
              )}
              {template.content.duration && (
                <MetadataRow label="Duration">
                  {template.content.duration} seconds
                </MetadataRow>
              )}
              {template.content.structure && (
                <Collapsible className="rounded-lg border border-white/[0.08] bg-background/50">
                  <CollapsibleTrigger className="w-full cursor-pointer list-none px-4 py-3 text-left text-sm font-medium">
                    Structure
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-4 pb-4">
                    <Pre>
                      {JSON.stringify(template.content.structure, null, 2)}
                    </Pre>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </VStack>
          </DetailCard>
        </VStack>

        {/* Sidebar */}
        <TemplateSidebar
          metadata={template.metadata}
          performance={template.performance}
          createdAt={template.createdAt}
          updatedAt={template.updatedAt}
        />
      </div>
    </div>
  );
}
