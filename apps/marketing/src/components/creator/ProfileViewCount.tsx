'use client';

import { trackPublicView } from '@data/public-views';
import type { ProfileViewCountProps } from '@props/content/creator.props';
import { useEffect, useState } from 'react';

const viewCountFormatter = new Intl.NumberFormat('en-US');

/**
 * Counts this visit to the profile and shows how many people have viewed it.
 * The browser makes the call, so the count follows real visitors rather than
 * page renders; a visitor counts once a day.
 */
export default function ProfileViewCount({
  brandId,
}: ProfileViewCountProps): React.ReactElement | null {
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function countVisit(): Promise<void> {
      try {
        const count = await trackPublicView(
          'profile',
          brandId,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setViews(count);
        }
      } catch {
        // The count is a nicety: a failed call leaves the rail without it.
      }
    }
    void countVisit();
    return () => controller.abort();
  }, [brandId]);

  if (!views) {
    return null;
  }

  return (
    <p className="text-sm text-foreground/60">
      <span className="font-semibold text-foreground">
        {viewCountFormatter.format(views)}
      </span>{' '}
      {views === 1 ? 'view' : 'views'}
    </p>
  );
}
