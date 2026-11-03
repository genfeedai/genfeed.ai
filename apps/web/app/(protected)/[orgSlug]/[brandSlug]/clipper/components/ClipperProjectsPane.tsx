'use client';

import type { CreativeAppAgentContext } from '@genfeedai/contracts/interfaces';
import Container from '@ui/layout/container/Container';
import { useCreativeProjectsPresence } from '@ui/layout/creative-app-workspace/CreativeAppWorkspace';
import CreativeProjectsEmptyState from '@ui/layout/creative-app-workspace/CreativeProjectsEmptyState';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Alert } from '@ui/primitives/alert';
import { GalleryHorizontalStart } from '@ui/primitives/animated-icons/custom-lucide';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';
import { useCreativeAppAgentContext } from '@/hooks/agent/use-creative-app-agent-context/use-creative-app-agent-context';
import { useStudioClipperProjects } from '../useStudioClipperProjects';
import ClipperProjectList from './ClipperProjectList';

/**
 * The right side of the Clipper workspace while no project is open: one list
 * of the brand's clip projects. A row opens the project; importing a source
 * happens in the prompt on the left.
 */
export default function ClipperProjectsPane() {
  const t = useTranslations('pages.studioClipper');
  const {
    deleteProject,
    error,
    isLoading,
    projects,
    pageTotals,
    renameProject,
  } = useStudioClipperProjects({ isEnabled: true });
  const { search, setSearch } = useAdminSearchParam();
  // The agent hears about the projects on screen once the list has loaded, so
  // a change request is never matched against a half-known list.
  const creativeApp = useMemo<CreativeAppAgentContext | null>(
    () =>
      isLoading || error
        ? null
        : {
            app: 'clipper',
            projects: projects.map((item) => ({
              id: item.id,
              title: item.name || t('newProject'),
            })),
          },
    [error, isLoading, projects, t],
  );
  useCreativeAppAgentContext(creativeApp);
  const isSearching = search !== '';
  const hasProjects = projects.length > 0;
  const isEmpty = !isLoading && !hasProjects && !error;
  // An empty page past the last one (the final row of a page deleted) is not
  // an empty brand: the total says whether any project exists.
  useCreativeProjectsPresence(
    hasProjects || pageTotals.totalDocs > 0
      ? 'populated'
      : isEmpty && !isSearching
        ? 'empty'
        : 'unknown',
  );

  return (
    <Container
      label={t('title')}
      leading={
        <SearchField
          ariaLabel={t('search')}
          onSearch={setSearch}
          placeholder={t('search')}
          value={search}
        />
      }
      moduleChrome
      titleVisibility="sr-only"
    >
      <div className="flex w-full flex-col gap-4">
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {isEmpty && isSearching ? (
          <CreativeProjectsEmptyState
            icon={GalleryHorizontalStart}
            title={t('emptySearch')}
          />
        ) : null}
        {isEmpty && !isSearching ? (
          <CreativeProjectsEmptyState
            description={t('noProjectsDescription')}
            icon={GalleryHorizontalStart}
            title={t('noProjectsYet')}
          />
        ) : null}
        {isLoading || hasProjects ? (
          <ClipperProjectList
            isLoading={isLoading}
            onDelete={deleteProject}
            onRename={renameProject}
            projects={projects}
          />
        ) : null}
        {hasProjects && !isLoading ? (
          <AutoPagination showTotal totalLabel="projects" totals={pageTotals} />
        ) : null}
      </div>
    </Container>
  );
}
