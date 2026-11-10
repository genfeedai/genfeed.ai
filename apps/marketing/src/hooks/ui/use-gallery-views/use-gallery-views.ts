'use client';

import { trackPublicMediaViews } from '@data/public-views';
import type { GalleryViews } from '@props/content/profile.props';
import { useCallback, useEffect, useRef, useState } from 'react';

/** How much of an item must be on screen before it counts as seen. */
const VISIBLE_RATIO = 0.5;
/** Items seen within this window are counted in one request. */
const FLUSH_DELAY_MS = 1000;

/**
 * Counts the gallery items a visitor actually sees. An item counts once at
 * least half of it has been on screen; items are sent in batches, and the API
 * counts each visitor once a day. Pages are statically cached, so the browser
 * makes the call.
 */
export function useGalleryViews(): GalleryViews {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const seen = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  const observer = useRef<IntersectionObserver | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);

  const flush = useCallback(() => {
    timer.current = null;
    const ids = [...pending.current];
    pending.current.clear();
    controller.current ??= new AbortController();
    const signal = controller.current.signal;
    trackPublicMediaViews(ids, signal)
      .then((fresh) => {
        if (!signal.aborted) {
          setCounts((current) => ({ ...current, ...fresh }));
        }
      })
      .catch(() => {
        // The count is a nicety: a failed call leaves the cards as they were.
      });
  }, []);

  const getObserver = useCallback((): IntersectionObserver | null => {
    if (observer.current || typeof IntersectionObserver === 'undefined') {
      return observer.current;
    }
    observer.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.galleryId;
          if (!entry.isIntersecting || !id || seen.current.has(id)) {
            continue;
          }
          seen.current.add(id);
          pending.current.add(id);
          observer.current?.unobserve(entry.target);
        }
        if (pending.current.size > 0 && timer.current === null) {
          timer.current = setTimeout(flush, FLUSH_DELAY_MS);
        }
      },
      { threshold: VISIBLE_RATIO },
    );
    return observer.current;
  }, [flush]);

  const observe = useCallback(
    (node: HTMLElement | null) => {
      const id = node?.dataset.galleryId;
      if (node && id && !seen.current.has(id)) {
        getObserver()?.observe(node);
      }
    },
    [getObserver],
  );

  useEffect(
    () => () => {
      observer.current?.disconnect();
      controller.current?.abort();
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  return { counts, observe };
}
