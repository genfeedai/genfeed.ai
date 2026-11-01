import { EmptyStateCard } from '@ui/primitives/empty-state';

interface ProfileEmptyStateProps {
  handle: string;
}

export default function ProfileEmptyState({ handle }: ProfileEmptyStateProps) {
  return (
    <EmptyStateCard
      title="Nothing here yet"
      description={`@${handle} has not shared any content, links or socials yet. Check back soon.`}
    />
  );
}
