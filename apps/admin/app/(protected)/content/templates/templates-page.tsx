'use client';

import type { IContentTemplate } from '@genfeedai/interfaces/content/template-ui.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { TemplateService } from '@services/content/template.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { HiOutlineDocumentText } from 'react-icons/hi2';

export default function TemplatesPage() {
  const notificationsService = NotificationsService.getInstance();

  const getTemplatesService = useAuthedService((token: string) =>
    TemplateService.getInstance(token),
  );

  const [templates, setTemplates] = useState<IContentTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);

    try {
      const service = await getTemplatesService();
      const data = await service.getTemplates();

      setTemplates(data);
      logger.info('Loaded templates', { count: data.length });
    } catch (error) {
      logger.error('Failed to load templates', error);
      notificationsService.error('Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  }, [getTemplatesService, notificationsService]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  if (isLoading) {
    return (
      <Container
        label="Templates"
        description="Create and manage reusable content templates"
        icon={HiOutlineDocumentText}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} showImage={false} />
          ))}
        </div>
      </Container>
    );
  }

  return (
    <Container
      label="Templates"
      description="Create and manage reusable content templates"
      icon={HiOutlineDocumentText}
    >
      <WorkspaceSurface
        title="Content Templates"
        tone="muted"
        data-testid="content-templates-surface"
      >
        {templates.length === 0 ? (
          <CardEmpty label="No templates yet" />
        ) : (
          <div
            data-testid="templates-grid"
            className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
          >
            {templates.map((template) => (
              <Link
                key={template.id}
                href={`/templates/${template.id}`}
                className="group block h-full rounded-[1.35rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={`Open template ${template.name}`}
              >
                <Card
                  data-testid="template-card"
                  className="h-full transition-[transform,box-shadow,border-color] duration-200 group-hover:-translate-y-0.5 group-hover:border-white/[0.14] group-hover:shadow-[0_22px_44px_-28px_rgba(0,0,0,0.72)]"
                  bodyClassName="flex h-full flex-col gap-4 p-6"
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{template.name}</h3>
                      {template.isActive !== undefined && (
                        <Badge
                          className={
                            template.isActive
                              ? 'bg-success/10 text-success'
                              : 'bg-warning/10 text-warning'
                          }
                        >
                          {template.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      )}
                    </div>

                    {template.description && (
                      <p className="text-sm leading-6 text-foreground/70">
                        {template.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/60">
                      <span className="capitalize inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-current/20">
                        {template.category.replace(/-/g, ' ')}
                      </span>

                      {template.metadata?.difficulty && (
                        <span className="capitalize">
                          {template.metadata.difficulty}
                        </span>
                      )}

                      {template.performance?.usageCount !== undefined && (
                        <span>{template.performance.usageCount} uses</span>
                      )}
                    </div>

                    {template.variables.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs text-foreground/60">
                          Variables:
                        </span>

                        {template.variables.map((variable) => (
                          <code
                            key={variable.name}
                            className="text-xs bg-background px-2 py-1"
                          >
                            {`{{${variable.name}}}`}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto flex items-center justify-between border-t border-white/[0.08] pt-4 text-sm text-foreground/55">
                    <span>Open template</span>
                    <span className="font-medium text-foreground transition-colors group-hover:text-primary">
                      View details
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </WorkspaceSurface>
    </Container>
  );
}
