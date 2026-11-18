'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { formatEnumLabel } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ITurboProject } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { ThreadListSubtitle } from '@ui/lists/thread-list/ThreadList';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { turboProjectListStatus } from '@/features/workflows/pages/turbo/turbo-project-list-status';
import {
  createTurboProjectsApi,
  type TurboProjectsApi,
} from '@/features/workflows/pages/turbo/turbo-projects-api';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import type { AppRailPreviewItem } from '@/props/ui/app-rail-preview.props';
import RailPreviewProjects from './RailPreviewProjects';

const PREVIEW_LIMIT = 4;

/** Turbo: the brand's latest projects. */
export default function TurboRailPreview(_props: AppRailPreviewContentProps) {
  const translate = useTranslations('common.appRail.preview.projects');
  const { brandId } = useBrand();
  const { href } = useOrgUrl();
  const projects = useAuthedQuery<TurboProjectsApi, ITurboProject[]>({
    enabled: Boolean(brandId),
    queryFn: (service, signal) => service.list(brandId, 1, signal),
    queryKey: ['app-rail-preview', 'turbo', brandId || null],
    service: createTurboProjectsApi,
    staleTime: 30_000,
  });
  const items = useMemo<AppRailPreviewItem[]>(
    () =>
      (projects.data ?? []).slice(0, PREVIEW_LIMIT).map((project) => ({
        href: href(`${APP_ROUTES.STUDIO.TURBO}/${project.id}`),
        id: project.id,
        isoDate: project.updatedAt,
        status: turboProjectListStatus(project.status),
        statusLabel: formatEnumLabel(project.status) ?? undefined,
        subtitle: (
          <ThreadListSubtitle
            parts={[
              formatEnumLabel(project.kind),
              translate('itemCount', { count: project.itemCounts.total }),
            ]}
          />
        ),
        title: project.name,
      })),
    [href, projects.data, translate],
  );

  return (
    <RailPreviewProjects
      isError={projects.isError}
      isLoading={projects.isPending}
      items={items}
      translationKey="turbo"
    />
  );
}
