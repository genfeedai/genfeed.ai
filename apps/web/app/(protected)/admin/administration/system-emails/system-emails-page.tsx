'use client';
import SystemEmailPerformance from '@app/(protected)/admin/administration/system-emails/system-email-performance';
import SystemEmailRangeFilter from '@app/(protected)/admin/administration/system-emails/system-email-range-filter';
import { useSystemEmailRange } from '@app/(protected)/admin/administration/system-emails/use-system-email-range';
import {
  buildLifecycleSystemEmailAction,
  type LifecycleSystemEmailDefinition,
  renderLifecycleSystemEmailParagraphs,
} from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFilteredData } from '@hooks/utils/use-filtered-data/use-filtered-data';
import { AdminSystemEmailsService } from '@services/admin/system-emails.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';

import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ui/primitives/accordion';
import { Badge } from '@ui/primitives/badge';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionRow,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import { EmptyState } from '@ui/primitives/empty-state';
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';

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
  const searchT = useTranslations('common.adminSearch');
  const { search, setSearch } = useAdminSearchParam();
  const [emails, setEmails] = useState<LifecycleSystemEmailDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const range = useSystemEmailRange();
  const visibleEmails = useFilteredData({
    data: emails,
    filter: search,
    filterFields: (email) => [
      email.name,
      email.subject,
      email.sequence,
      email.audience,
      email.trigger,
    ],
  });

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

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadEmails(new AbortController().signal);
    setIsRefreshing(false);
  }, [loadEmails]);

  return (
    <AdminPageShell
      title="System emails"
      icon={Mail}
      search={
        <SearchField
          ariaLabel={searchT('systemEmails')}
          onSearch={setSearch}
          placeholder={searchT('systemEmails')}
          value={search}
        />
      }
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      dropdowns={<SystemEmailRangeFilter range={range} />}
    >
      <SystemEmailPerformance query={range.query} />
      {isLoading ? (
        <div className="grid gap-4">
          {SYSTEM_EMAIL_SKELETON_KEYS.map((key) => (
            <SkeletonCard key={key} showImage={false} />
          ))}
        </div>
      ) : (
        <WorkspaceSurface
          framed={false}
          tone="muted"
          data-testid="system-emails-surface"
        >
          {visibleEmails.length === 0 ? (
            <EmptyState
              title={
                search
                  ? 'No system emails match your search'
                  : 'No system emails registered'
              }
            />
          ) : (
            <Card>
              <Accordion type="multiple" className="px-6">
                {visibleEmails.map((email) => (
                  <AccordionItem
                    key={email.id}
                    value={email.id}
                    className="last:border-b-0"
                  >
                    <AccordionTrigger className="gap-4 text-left hover:no-underline">
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {email.name}
                          </span>
                          <Badge variant="outline">{email.sequence}</Badge>
                          <Badge variant="secondary">{email.visibility}</Badge>
                        </span>
                        <span className="text-xs font-normal text-foreground/60">
                          {email.schedule}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-5">
                      <p className="text-xs text-foreground/50">
                        {email.systemWorkflowId}
                      </p>

                      <DefinitionList columns={3} variant="metrics">
                        <DefinitionRow>
                          <DefinitionTerm variant="label">
                            Trigger
                          </DefinitionTerm>
                          <DefinitionDetail className="mt-1">
                            {email.trigger}
                          </DefinitionDetail>
                        </DefinitionRow>
                        <DefinitionRow>
                          <DefinitionTerm variant="label">
                            Schedule
                          </DefinitionTerm>
                          <DefinitionDetail className="mt-1">
                            {email.schedule}
                          </DefinitionDetail>
                        </DefinitionRow>
                        <DefinitionRow>
                          <DefinitionTerm variant="label">
                            Audience
                          </DefinitionTerm>
                          <DefinitionDetail className="mt-1">
                            {email.audience}
                          </DefinitionDetail>
                        </DefinitionRow>
                      </DefinitionList>

                      <section className="border-t border-border pt-4">
                        <DefinitionList variant="properties">
                          <DefinitionRow>
                            <DefinitionTerm variant="label">
                              Subject
                            </DefinitionTerm>
                            <DefinitionDetail className="font-medium text-foreground">
                              {email.subject}
                            </DefinitionDetail>
                          </DefinitionRow>
                          <DefinitionRow>
                            <DefinitionTerm variant="label">
                              Preheader
                            </DefinitionTerm>
                            <DefinitionDetail>
                              {email.preheader}
                            </DefinitionDetail>
                          </DefinitionRow>
                          <DefinitionRow>
                            <DefinitionTerm variant="label">
                              Title
                            </DefinitionTerm>
                            <DefinitionDetail>{email.title}</DefinitionDetail>
                          </DefinitionRow>
                          <DefinitionRow>
                            <DefinitionTerm variant="label">CTA</DefinitionTerm>
                            <DefinitionDetail>
                              {resolvePreviewAction(email)}
                            </DefinitionDetail>
                          </DefinitionRow>
                        </DefinitionList>
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
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Card>
          )}
        </WorkspaceSurface>
      )}
    </AdminPageShell>
  );
}
