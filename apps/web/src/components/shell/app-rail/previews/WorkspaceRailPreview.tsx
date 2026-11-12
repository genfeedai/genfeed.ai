'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { getBrandEntityId } from '@contexts/user/brand-context/brand-context.helpers';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { type Task, TasksService } from '@services/management/tasks.service';
import { ThreadListSubtitle } from '@ui/lists/thread-list/ThreadList';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useOverviewBootstrap } from '@/hooks/data/overview/use-overview-bootstrap';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import type { AppRailPreviewItem } from '@/props/ui/app-rail-preview.props';
import {
  RailPreviewItems,
  RailPreviewSection,
  RailPreviewStat,
  RailPreviewState,
} from './rail-preview-parts';

const PREVIEW_TASK_LIMIT = 5;

function taskStatus(task: Task): AppRailPreviewItem['status'] {
  if (
    task.reviewState === 'pending_approval' ||
    task.reviewState === 'changes_requested'
  ) {
    return 'attention';
  }
  if (task.status === 'failed') return 'failed';
  if (task.status === 'in_progress') return 'running';
  if (task.status === 'done') return 'done';
  return 'idle';
}

/** Workspace: what the review inbox holds right now. */
export default function WorkspaceRailPreview({
  href,
}: AppRailPreviewContentProps) {
  const translate = useTranslations('common.appRail.preview.workspace');
  const locale = useLocale();
  const { brandId, brands } = useBrand();
  const brand = brands.find(
    (candidate) => getBrandEntityId(candidate) === brandId,
  );
  const overview = useOverviewBootstrap({
    brandId: brandId || undefined,
    revalidateOnMount: true,
  });
  const inbox = useAuthedQuery<TasksService, Task[]>({
    queryFn: (service) => service.getInbox(PREVIEW_TASK_LIMIT),
    queryKey: ['app-rail-preview', 'workspace-inbox', brand?.id ?? null],
    service: (token: string) => TasksService.getInstance(token),
    staleTime: 30_000,
  });
  const items = useMemo<AppRailPreviewItem[]>(
    () =>
      (inbox.data ?? []).slice(0, PREVIEW_TASK_LIMIT).map((task) => ({
        href,
        id: task.id,
        isoDate: task.updatedAt ?? task.createdAt,
        status: taskStatus(task),
        subtitle: <ThreadListSubtitle parts={[task.identifier]} />,
        title: task.title,
      })),
    [href, inbox.data],
  );
  const number = new Intl.NumberFormat(locale, { notation: 'compact' });
  const { analytics, reviewInbox } = overview;

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5 p-1">
        <RailPreviewStat
          label={translate('posts')}
          value={number.format(analytics.totalPosts ?? 0)}
        />
        <RailPreviewStat
          label={translate('inReview')}
          value={number.format(reviewInbox.pendingCount)}
        />
        <RailPreviewStat
          label={translate('ready')}
          value={number.format(reviewInbox.readyCount)}
        />
      </div>
      <RailPreviewSection title={translate('inbox')}>
        <RailPreviewState
          emptyLabel={translate('empty')}
          isEmpty={items.length === 0}
          isError={inbox.isError}
          isLoading={inbox.isPending}
        >
          <RailPreviewItems items={items} />
        </RailPreviewState>
      </RailPreviewSection>
    </>
  );
}
