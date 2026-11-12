'use client';

import { trackPublicView } from '@data/public-views';
import type { ViewTrackerProps } from '@props/content/creator.props';
import { useEffect } from 'react';

/**
 * Counts this visit to a profile or article. The count is recorded but never
 * shown publicly. The browser makes the call, so the count follows real
 * visitors rather than page renders (both pages are statically cached); a
 * visitor counts once a day.
 */
export default function ViewTracker({ id, target }: ViewTrackerProps): null {
  useEffect(() => {
    const controller = new AbortController();
    async function countVisit(): Promise<void> {
      try {
        await trackPublicView(target, id, controller.signal);
      } catch {
        // Counting is best effort: a failed call must not affect the page.
      }
    }
    void countVisit();
    return () => controller.abort();
  }, [id, target]);

  return null;
}
