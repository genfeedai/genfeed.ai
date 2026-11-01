import { EmptyState } from '@ui/primitives/empty-state';

interface ProfileEmptyStateProps {
  handle: string;
}

export default function ProfileEmptyState({ handle }: ProfileEmptyStateProps) {
  return (
    <EmptyState
      description={`@${handle} has not shared any content, links or socials yet. Check back soon.`}
      surface="card"
      title="Nothing here yet"
    />
  );
}
