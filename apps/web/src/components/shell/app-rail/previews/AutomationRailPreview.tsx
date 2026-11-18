'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { Badge } from '@ui/primitives/badge';
import { useLocale, useTranslations } from 'next-intl';
import {
  createWorkflowApiService,
  type WorkflowApiService,
  type WorkflowSummary,
} from '@/features/workflows/services/workflow-api';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import {
  RailPreviewLinkRow,
  RailPreviewSection,
  RailPreviewState,
} from './rail-preview-parts';

const PREVIEW_LIMIT = 5;

/** Automation: the most recently edited workflows and when they run next. */
export default function AutomationRailPreview({
  href,
}: AppRailPreviewContentProps) {
  const translate = useTranslations('common.appRail.preview.automation');
  const locale = useLocale();
  const { brandId } = useBrand();
  const workflows = useAuthedQuery<WorkflowApiService, WorkflowSummary[]>({
    queryFn: async (service) => {
      const rows = await service.list(brandId ? { brandId } : undefined);
      return [...rows]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, PREVIEW_LIMIT);
    },
    queryKey: ['app-rail-preview', 'automation', brandId || null],
    service: createWorkflowApiService,
    staleTime: 60_000,
  });
  const items = workflows.data ?? [];

  return (
    <RailPreviewSection title={translate('title')}>
      <RailPreviewState
        emptyLabel={translate('empty')}
        isEmpty={items.length === 0}
        isError={workflows.isError}
        isLoading={workflows.isPending}
      >
        <ul>
          {items.map((workflow) => (
            <RailPreviewLinkRow
              href={href}
              key={workflow.id}
              subtitle={
                workflow.isScheduleEnabled && workflow.nextRunAt
                  ? translate('nextRun', {
                      date: new Date(workflow.nextRunAt).toLocaleString(
                        locale,
                        {
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          month: 'short',
                        },
                      ),
                    })
                  : translate('nodes', { count: workflow.nodeCount })
              }
              title={workflow.label}
              trailing={
                workflow.isScheduleEnabled ? (
                  <Badge size="sm" variant="success">
                    {translate('scheduled')}
                  </Badge>
                ) : undefined
              }
            />
          ))}
        </ul>
      </RailPreviewState>
    </RailPreviewSection>
  );
}
