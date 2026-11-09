'use client';

import { trackPublicView } from '@data/public-views';
import type { ViewCountProps } from '@props/content/creator.props';
import { useEffect, useState } from 'react';

const viewCountFormatter = new Intl.NumberFormat('en-US');

/**
 * Counts this visit to a profile or article and shows how many people have
 * viewed it. The browser makes the call, so the count follows real visitors
 * rather than page renders (both pages are statically cached); a visitor
 * counts once a day.
 */
export default function ViewCount({
  id,
  target,
}: ViewCountProps): React.ReactElement | null {
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function countVisit(): Promise<void> {
      try {
        const count = await trackPublicView(target, id, controller.signal);
        if (!controller.signal.aborted) {
          setViews(count);
        }
      } catch {
        // The count is a nicety: a failed call leaves the page without it.
      }
    }
    void countVisit();
    return () => controller.abort();
  }, [id, target]);

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
