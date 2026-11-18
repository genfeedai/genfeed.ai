'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { formatEnumLabel } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IVisualProject } from '@genfeedai/contracts/interfaces';
import type { ThreadListStatus } from '@genfeedai/props/ui/lists/thread-list.props';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { VisualProjectsService } from '@services/content/visual-projects.service';
import { ThreadListSubtitle } from '@ui/lists/thread-list/ThreadList';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import type { AppRailPreviewItem } from '@/props/ui/app-rail-preview.props';
import RailPreviewProjects from './RailPreviewProjects';

const PREVIEW_LIMIT = 4;

/** A failed render waits on the creator; a finished one is done. */
function motionStatus(status: string): ThreadListStatus {
  const normalised = status.toLowerCase();
  if (normalised === 'failed') return 'attention';
  if (normalised === 'completed') return 'done';
  return 'idle';
}

/** Motion: the brand's latest visual projects. */
export default function MotionRailPreview(_props: AppRailPreviewContentProps) {
  const translate = useTranslations('common.appRail.preview.projects');
  const { brandId } = useBrand();
  const { href } = useOrgUrl();
  const projects = useAuthedQuery<VisualProjectsService, IVisualProject[]>({
    enabled: Boolean(brandId),
    queryFn: async (service, signal) =>
      (await service.list(brandId, undefined, signal)).projects,
    queryKey: ['app-rail-preview', 'motion', brandId || null],
    service: (token: string) => VisualProjectsService.getInstance(token),
    staleTime: 30_000,
  });
  const items = useMemo<AppRailPreviewItem[]>(
    () =>
      (projects.data ?? []).slice(0, PREVIEW_LIMIT).map((project) => {
        const status = project.revisions?.[0]?.status;
        return {
          href: `${href(APP_ROUTES.STUDIO.MOTION)}/${encodeURIComponent(project.id)}`,
          id: project.id,
          isoDate: project.updatedAt,
          status: status ? motionStatus(status) : 'idle',
          statusLabel: status
            ? (formatEnumLabel(status) ?? undefined)
            : undefined,
          subtitle: (
            <ThreadListSubtitle
              parts={[
                translate('revision', { number: project.currentRevision }),
              ]}
            />
          ),
          title: project.label,
        };
      }),
    [href, projects.data, translate],
  );

  return (
    <RailPreviewProjects
      isError={projects.isError}
      isLoading={projects.isPending}
      items={items}
      translationKey="motion"
    />
  );
}
