'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { ContentRunsService } from '@services/content/content-runs.service';
import { ThreadListSubtitle } from '@ui/lists/thread-list/ThreadList';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { StoryboardListRun } from '@/features/studio/props/storyboard.props';
import { isStoryboardRunNeedingAttention } from '@/features/studio/storyboard/utils/storyboard-run-summary';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import type { AppRailPreviewItem } from '@/props/ui/app-rail-preview.props';
import RailPreviewProjects from './RailPreviewProjects';

const PREVIEW_LIMIT = 4;

/** Storyboard: the brand's latest saved runs. */
export default function StoryboardRailPreview(
  _props: AppRailPreviewContentProps,
) {
  const translate = useTranslations('common.appRail.preview.projects');
  const { brandId } = useBrand();
  const { href } = useOrgUrl();
  const runs = useAuthedQuery<ContentRunsService, StoryboardListRun[]>({
    enabled: Boolean(brandId),
    queryFn: (service, signal) =>
      service.listStoryboardRuns(
        brandId,
        { limit: PREVIEW_LIMIT, page: 1 },
        signal,
      ),
    queryKey: ['app-rail-preview', 'storyboard', brandId || null],
    service: (token: string) => ContentRunsService.getInstance(token),
    staleTime: 30_000,
  });
  const items = useMemo<AppRailPreviewItem[]>(
    () =>
      (runs.data ?? []).slice(0, PREVIEW_LIMIT).map((run) => {
        const isAttention = isStoryboardRunNeedingAttention(run);
        return {
          href: `${href(APP_ROUTES.STUDIO.STORYBOARD)}/${encodeURIComponent(run.id)}`,
          id: run.id,
          isoDate: run.updatedAt,
          status: isAttention ? 'attention' : 'idle',
          statusLabel: isAttention ? translate('needsYou') : undefined,
          subtitle: (
            <ThreadListSubtitle
              parts={[translate('shotCount', { count: run.shotCount })]}
            />
          ),
          title: run.title,
        };
      }),
    [href, runs.data, translate],
  );

  return (
    <RailPreviewProjects
      isError={runs.isError}
      isLoading={runs.isPending}
      items={items}
      translationKey="storyboard"
    />
  );
}
