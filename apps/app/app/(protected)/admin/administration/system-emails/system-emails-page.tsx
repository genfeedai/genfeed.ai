'use client';

import {
  buildLifecycleSystemEmailAction,
  type LifecycleSystemEmailDefinition,
  renderLifecycleSystemEmailParagraphs,
} from '@genfeedai/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminSystemEmailsService } from '@services/admin/system-emails.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { useCallback, useEffect, useState } from 'react';
import { HiOutlineEnvelope } from 'react-icons/hi2';

const SYSTEM_EMAIL_SKELETON_KEYS = [
  'system-email-skeleton-1',
  'system-email-skeleton-2',
  'system-email-skeleton-3',
] as const;

function resolvePreviewAction(email: LifecycleSystemEmailDefinition): string {
  if (email.action.type === 'checkout-or-app-root') {
    const fallback = buildLifecycleSystemEmailAction(
      email,
      EnvironmentService.apps.app,
    );

    return `${email.action.label} -> checkout session URL, fallback ${fallback.label} -> ${fallback.url}`;
  }

  const action = buildLifecycleSystemEmailAction(
    email,
    EnvironmentService.apps.app,
  );

  return `${action.label} -> ${action.url}`;
}

export default function SystemEmailsPage() {
  const [emails, setEmails] = useState<LifecycleSystemEmailDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const notificationsService = NotificationsService.getInstance();
  const getSystemEmailsService = useAuthedService((token: string) =>
    AdminSystemEmailsService.getInstance(token),
  );

  const loadEmails = useCallback(
    async (signal: AbortSignal) => {
      try {
        const service = await getSystemEmailsService();
        const data = await service.getSystemEmails(signal);

        if (!signal.aborted) {
          setEmails(data);
          logger.info('System emails loaded', { count: data.length });
        }
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        logger.error('Failed to load system emails', error);
        notificationsService.error('Failed to load system emails');
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [getSystemEmailsService, notificationsService],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadEmails(controller.signal);

    return () => controller.abort();
  }, [loadEmails]);

  return (
    <Container
      label="System emails"
      description="Platform-owned lifecycle emails, triggers, and copy"
      icon={HiOutlineEnvelope}
    >
      {isLoading ? (
        <div className="grid gap-4">
          {SYSTEM_EMAIL_SKELETON_KEYS.map((key) => (
            <SkeletonCard key={key} showImage={false} />
          ))}
        </div>
      ) : (
        <WorkspaceSurface
          title="Lifecycle Email Registry"
          tone="muted"
          data-testid="system-emails-surface"
        >
          <div className="grid gap-4">
            {emails.length === 0 ? (
              <CardEmpty label="No system emails registered" />
            ) : (
              emails.map((email) => (
                <Card key={email.id}>
                  <article className="space-y-5 p-6">
                    <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">
                            {email.name}
                          </h3>
                          <Badge variant="info">System</Badge>
                          <Badge variant="outline">{email.sequence}</Badge>
                        </div>
                        <p className="text-sm text-foreground/70">
                          {email.systemWorkflowId}
                        </p>
                      </div>
                      <Badge variant="ghost">{email.visibility}</Badge>
                    </header>

                    <dl className="grid gap-4 md:grid-cols-3">
                      <div>
                        <dt className="text-xs font-medium uppercase text-foreground/50">
                          Trigger
                        </dt>
                        <dd className="mt-1 text-sm text-foreground">
                          {email.trigger}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase text-foreground/50">
                          Schedule
                        </dt>
                        <dd className="mt-1 text-sm text-foreground">
                          {email.schedule}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase text-foreground/50">
                          Audience
                        </dt>
                        <dd className="mt-1 text-sm text-foreground">
                          {email.audience}
                        </dd>
                      </div>
                    </dl>

                    <section className="border-t border-border pt-4">
                      <div className="grid gap-3 md:grid-cols-[9rem_1fr]">
                        <span className="text-xs font-medium uppercase text-foreground/50">
                          Subject
                        </span>
                        <p className="text-sm font-medium text-foreground">
                          {email.subject}
                        </p>
                        <span className="text-xs font-medium uppercase text-foreground/50">
                          Preheader
                        </span>
                        <p className="text-sm text-foreground/75">
                          {email.preheader}
                        </p>
                        <span className="text-xs font-medium uppercase text-foreground/50">
                          Title
                        </span>
                        <p className="text-sm text-foreground/75">
                          {email.title}
                        </p>
                        <span className="text-xs font-medium uppercase text-foreground/50">
                          CTA
                        </span>
                        <p className="text-sm text-foreground/75">
                          {resolvePreviewAction(email)}
                        </p>
                      </div>
                    </section>

                    <section className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">
                        Body copy
                      </h4>
                      <div className="space-y-2">
                        {renderLifecycleSystemEmailParagraphs(
                          email,
                          'Hi {first name}',
                        ).map((paragraph) => (
                          <p
                            key={paragraph}
                            className="border-l border-border pl-3 text-sm text-foreground/80"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">
                        Skip rules
                      </h4>
                      <ul className="grid gap-2 md:grid-cols-2">
                        {email.skipRules.map((rule) => (
                          <li
                            key={rule}
                            className="border-l border-border pl-3 text-sm text-foreground/70"
                          >
                            {rule}
                          </li>
                        ))}
                      </ul>
                    </section>
                  </article>
                </Card>
              ))
            )}
          </div>
        </WorkspaceSurface>
      )}
    </Container>
  );
}
