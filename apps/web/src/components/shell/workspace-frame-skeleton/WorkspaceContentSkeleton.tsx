import { Skeleton } from '@ui/primitives/skeleton';
import type { WorkspaceContentSkeletonProps } from '@/props/layout/workspace-frame-skeleton.props';

const CONTENT_CARD_SLOTS = ['first', 'second', 'third'] as const;
const CONTENT_CLASS_NAME = 'flex w-full flex-col gap-6 p-6';

/**
 * Page-body placeholder: a title, a line of description and a row of cards.
 * It fills the content area of a shell that is already on screen, so a page
 * waiting on its data never drops to a blank area or a lone spinner.
 */
export default function WorkspaceContentSkeleton({
  label,
}: WorkspaceContentSkeletonProps) {
  const placeholders = (
    <>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div
        aria-hidden="true"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {CONTENT_CARD_SLOTS.map((slot) => (
          <Skeleton key={slot} className="aspect-[4/3] w-full rounded-lg" />
        ))}
      </div>
    </>
  );

  if (!label) {
    return (
      <div
        className={CONTENT_CLASS_NAME}
        data-testid="workspace-content-skeleton"
      >
        {placeholders}
      </div>
    );
  }

  return (
    <div
      aria-busy="true"
      aria-label={label}
      className={CONTENT_CLASS_NAME}
      data-testid="workspace-content-skeleton"
      role="status"
    >
      {placeholders}
    </div>
  );
}
