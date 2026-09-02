'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ClipsProjectListProps } from '@props/studio/clips.props';
import LoadingState from '@ui/feedback/LoadingState';

import ClipsProjectCard from './ClipsProjectCard';

export default function ClipsProjectList({
  isLoading,
  projects,
}: ClipsProjectListProps) {
  const { href } = useOrgUrl();

  if (isLoading) {
    return (
      <div className="min-h-64" data-testid="clips-project-list-loading">
        <LoadingState isFullSize />
      </div>
    );
  }

  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="clips-project-list"
    >
      {projects.map((project) => (
        <ClipsProjectCard
          key={project.id}
          href={href(`${APP_ROUTES.STUDIO.CLIPS}/${project.id}`)}
          project={project}
        />
      ))}
    </div>
  );
}
