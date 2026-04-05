'use client';

import type { IContentTemplate } from '@genfeedai/interfaces/content/template-ui.interface';
import { ComponentSize } from '@genfeedai/enums';
import { Code, Pre } from '@genfeedai/ui';
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
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

/** Reusable card section with title, used across detail pages */
function DetailCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="border border-white/[0.08]">
      <VStack gap={4} className="p-6">
        <Heading size="lg">{title}</Heading>
        {children}
      </VStack>
    </Card>
  );
}

/** Metadata row: label + value */
function MetadataRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Text size="sm" weight="medium">
        {label}:{' '}
      </Text>
      <Text size="sm" color="subtle-70">
        {children}
      </Text>
    </div>
  );
}

export default function TemplateDetail({ templateId }: TemplateDetailProps) {
  const router = useRouter();
  const pathname = usePathname();
  const notificationsService = NotificationsService.getInstance();

  const getTemplatesService = useAuthedService((token: string) =>
    TemplateService.getInstance(token),
  );

  const [template, setTemplate] = useState<IContentTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadTemplate = useCallback(async () => {
    setIsLoading(true);

    try {
      const service = await getTemplatesService();
      const data = await service.getTemplate(templateId);

      setTemplate(data);
      logger.info('Loaded template', { id: templateId });
    } catch (error) {
      logger.error('Failed to load template', error);
      notificationsService.error('Failed to load template');
      router.push('/content/templates');
    } finally {
      setIsLoading(false);
    }
  }, [templateId, getTemplatesService, notificationsService, router]);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background/40 px-4 py-6 sm:px-6 lg:px-10">
        <Breadcrumb
          segments={[
            { href: '/content/templates', label: 'Templates' },
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
            { href: '/content/templates', label: 'Templates' },
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
          { href: '/content/templates', label: 'Templates' },
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

          {/* Variables Card */}
          {template.variables.length > 0 && (
            <DetailCard title="Variables">
              <VStack gap={4}>
                {template.variables.map((variable) => (
                  <div
                    key={variable.id}
                    className="border-b border-white/[0.08] pb-4 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Code size="md" className="bg-background">
                        {`{{${variable.name}}}`}
                      </Code>
                      <Badge variant="outline" size={ComponentSize.SM}>
                        {variable.type}
                      </Badge>
                      {variable.required && (
                        <Badge variant="error" size={ComponentSize.SM}>
                          Required
                        </Badge>
                      )}
                    </div>
                    {variable.label && (
                      <Text as="p" size="sm" weight="medium" className="mb-1">
                        {variable.label}
                      </Text>
                    )}
                    {variable.description && (
                      <Text as="p" size="sm" color="subtle-70" className="mb-2">
                        {variable.description}
                      </Text>
                    )}
                    {variable.defaultValue !== undefined && (
                      <Text as="p" size="xs" color="subtle-60">
                        Default: <Code>{String(variable.defaultValue)}</Code>
                      </Text>
                    )}
                    {variable.validation && (
                      <Text
                        as="div"
                        size="xs"
                        color="subtle-60"
                        className="mt-2"
                      >
                        {variable.validation.min !== undefined && (
                          <span>Min: {variable.validation.min} </span>
                        )}
                        {variable.validation.max !== undefined && (
                          <span>Max: {variable.validation.max} </span>
                        )}
                        {variable.validation.pattern && (
                          <span>Pattern: {variable.validation.pattern}</span>
                        )}
                      </Text>
                    )}
                    {variable.options && variable.options.length > 0 && (
                      <div className="mt-2">
                        <Text
                          as="p"
                          size="xs"
                          color="subtle-60"
                          className="mb-1"
                        >
                          Options:
                        </Text>
                        <div className="flex flex-wrap gap-2">
                          {variable.options.map((option) => (
                            <Badge
                              key={String(option.value)}
                              variant="ghost"
                              size={ComponentSize.SM}
                            >
                              {option.label} ({option.value})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </VStack>
            </DetailCard>
          )}

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
                <details className="rounded-lg border border-white/[0.08] bg-background/50">
                  <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
                    Structure
                  </summary>
                  <div className="px-4 pb-4">
                    <Pre>
                      {JSON.stringify(template.content.structure, null, 2)}
                    </Pre>
                  </div>
                </details>
              )}
            </VStack>
          </DetailCard>
        </VStack>

        {/* Sidebar */}
        <VStack gap={6}>
          {/* Metadata Card */}
          <DetailCard title="Metadata">
            <VStack gap={2} className="text-sm">
              {template.metadata?.version && (
                <MetadataRow label="Version">
                  {template.metadata.version}
                </MetadataRow>
              )}
              {template.metadata?.author && (
                <MetadataRow label="Author">
                  {template.metadata.author}
                </MetadataRow>
              )}
              {template.metadata?.estimatedTime && (
                <MetadataRow label="Estimated Time">
                  {template.metadata.estimatedTime} minutes
                </MetadataRow>
              )}
              {template.metadata?.requiredFeatures &&
                template.metadata.requiredFeatures.length > 0 && (
                  <div>
                    <Text size="sm" weight="medium">
                      Required Features:{' '}
                    </Text>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {template.metadata.requiredFeatures.map((feature) => (
                        <Badge
                          key={feature}
                          variant="ghost"
                          size={ComponentSize.SM}
                        >
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              {template.metadata?.compatiblePlatforms &&
                template.metadata.compatiblePlatforms.length > 0 && (
                  <div>
                    <Text size="sm" weight="medium">
                      Compatible Platforms:{' '}
                    </Text>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {template.metadata.compatiblePlatforms.map((platform) => (
                        <Badge
                          key={platform}
                          variant="ghost"
                          size={ComponentSize.SM}
                        >
                          {platform}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
            </VStack>
          </DetailCard>

          {/* Performance Card */}
          <DetailCard title="Performance">
            <VStack gap={2} className="text-sm">
              {template.performance?.usageCount !== undefined && (
                <MetadataRow label="Usage Count">
                  {template.performance.usageCount}
                </MetadataRow>
              )}
              {template.performance?.rating !== undefined && (
                <MetadataRow label="Rating">
                  {template.performance.rating.toFixed(1)} / 5.0
                </MetadataRow>
              )}
              {template.performance?.reviews !== undefined && (
                <MetadataRow label="Reviews">
                  {template.performance.reviews}
                </MetadataRow>
              )}
              {template.performance?.avgEngagement !== undefined && (
                <MetadataRow label="Avg Engagement">
                  {template.performance.avgEngagement.toFixed(1)}
                </MetadataRow>
              )}
              {template.performance?.avgReach !== undefined && (
                <MetadataRow label="Avg Reach">
                  {template.performance.avgReach.toFixed(1)}
                </MetadataRow>
              )}
              {template.performance?.successRate !== undefined && (
                <MetadataRow label="Success Rate">
                  {(template.performance.successRate * 100).toFixed(1)}%
                </MetadataRow>
              )}
            </VStack>
          </DetailCard>

          {/* Timestamps */}
          <DetailCard title="Timestamps">
            <VStack gap={2} className="text-sm">
              {template.createdAt && (
                <MetadataRow label="Created">
                  {new Date(template.createdAt).toLocaleString()}
                </MetadataRow>
              )}
              {template.updatedAt && (
                <MetadataRow label="Updated">
                  {new Date(template.updatedAt).toLocaleString()}
                </MetadataRow>
              )}
            </VStack>
          </DetailCard>
        </VStack>
      </div>
    </div>
  );
}
