import type { CreativeProjectsEmptyStateProps } from '@genfeedai/props/ui/layout/creative-app-layout.props';
import { EmptyState } from '@ui/primitives/empty-state';
import type { ReactElement } from 'react';

/**
 * The empty state of a creative app's projects list: the Editor's card with
 * its icon, title and one line. Every app's list uses it, for "no projects"
 * and for "nothing matches the search". Only "no projects" draws the faded
 * tiles (`hasPreview`).
 */
export default function CreativeProjectsEmptyState({
  description,
  hasPreview = false,
  icon,
  title,
}: CreativeProjectsEmptyStateProps): ReactElement {
  return (
    <EmptyState
      description={description}
      icon={icon}
      preview={hasPreview ? 'tiles' : undefined}
      surface="card"
      title={title}
    />
  );
}
