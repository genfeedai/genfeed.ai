'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { formatEnumLabel } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IEditorProject } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { EditorProjectsService } from '@services/editor/editor-projects.service';
import { ThreadListSubtitle } from '@ui/lists/thread-list/ThreadList';
import { useMemo } from 'react';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import type { AppRailPreviewItem } from '@/props/ui/app-rail-preview.props';
import RailPreviewProjects from './RailPreviewProjects';

const PREVIEW_LIMIT = 4;

/** Editor: the latest video projects. */
export default function EditorRailPreview(_props: AppRailPreviewContentProps) {
  const { brandId } = useBrand();
  const { href } = useOrgUrl();
  const projects = useAuthedQuery<EditorProjectsService, IEditorProject[]>({
    enabled: Boolean(brandId),
    queryFn: async (service, signal) =>
      (await service.findAllPage({ limit: PREVIEW_LIMIT, page: 1 }, signal))
        .items,
    queryKey: ['app-rail-preview', 'editor', brandId || null],
    service: (token: string) => EditorProjectsService.getInstance(token),
    staleTime: 30_000,
  });
  const items = useMemo<AppRailPreviewItem[]>(
    () =>
      (projects.data ?? []).slice(0, PREVIEW_LIMIT).map((project) => ({
        href: href(`${APP_ROUTES.STUDIO.EDITOR}/${project.id}`),
        id: project.id,
        isoDate: project.updatedAt,
        subtitle: project.status ? (
          <ThreadListSubtitle parts={[formatEnumLabel(project.status)]} />
        ) : undefined,
        title: project.name,
      })),
    [href, projects.data],
  );

  return (
    <RailPreviewProjects
      isError={projects.isError}
      isLoading={projects.isPending}
      items={items}
      translationKey="editor"
    />
  );
}
