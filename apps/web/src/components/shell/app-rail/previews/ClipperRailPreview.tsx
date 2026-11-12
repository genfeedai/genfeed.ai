'use client';

import { ClipperApiService } from '@app/(protected)/[orgSlug]/[brandSlug]/clipper/services/clipper-api.service';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useQuery } from '@tanstack/react-query';
import { ThreadListSubtitle } from '@ui/lists/thread-list/ThreadList';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import type { AppRailPreviewItem } from '@/props/ui/app-rail-preview.props';
import RailPreviewProjects from './RailPreviewProjects';

const PREVIEW_LIMIT = 4;

/** Clipper: the brand's latest clip projects. */
export default function ClipperRailPreview(_props: AppRailPreviewContentProps) {
  const translate = useTranslations('common.appRail.preview.projects');
  const { brandId } = useBrand();
  const { href } = useOrgUrl();
  const { getToken, orgId, userId } = useAuthIdentity();
  const projects = useQuery({
    enabled: Boolean(brandId && userId),
    queryFn: async ({ signal }) => {
      const service = new ClipperApiService(
        async () => (await resolveAuthToken(getToken)) ?? '',
      );
      return (
        await service.listProjects(
          { brandId, limit: PREVIEW_LIMIT, page: 1 },
          signal,
        )
      ).items;
    },
    queryKey: [
      'app-rail-preview',
      'clipper',
      userId ?? null,
      orgId ?? null,
      brandId || null,
    ],
    staleTime: 30_000,
  });
  const items = useMemo<AppRailPreviewItem[]>(
    () =>
      (projects.data ?? []).slice(0, PREVIEW_LIMIT).map((project) => ({
        href: href(`${APP_ROUTES.STUDIO.CLIPPER}/${project.id}`),
        id: project.id,
        isoDate: project.updatedAt ?? project.createdAt,
        status:
          project.status === 'failed'
            ? 'attention'
            : project.status === 'completed' && !project.isDraft
              ? 'done'
              : 'idle',
        subtitle: (
          <ThreadListSubtitle
            parts={[
              project.isDraft
                ? translate('draft')
                : translate('clipsCount', { count: project.readyClipCount }),
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
      translationKey="clipper"
    />
  );
}
