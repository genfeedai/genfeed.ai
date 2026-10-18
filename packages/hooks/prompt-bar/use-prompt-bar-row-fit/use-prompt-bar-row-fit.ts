'use client';

import type {
  UsePromptBarRowFitOptions,
  UsePromptBarRowFitReturn,
} from '@genfeedai/props/prompt-bars/prompt-bar-context-row.props';
import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a composer row on one line: reports `isCompact` once the full row
 * overflows, and clears it when the row is wide enough for the full width it
 * measured before compacting.
 */
export function usePromptBarRowFit({
  contentKey,
  rowRef,
}: UsePromptBarRowFitOptions): UsePromptBarRowFitReturn {
  const [compactKey, setCompactKey] = useState<string | null>(null);
  const fullWidthRef = useRef(0);
  const isCompact = compactKey === contentKey;

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const measure = () => {
      if (!isCompact) {
        if (row.scrollWidth > row.clientWidth + 1) {
          fullWidthRef.current = row.scrollWidth;
          setCompactKey(contentKey);
        }
        return;
      }
      if (row.clientWidth >= fullWidthRef.current) setCompactKey(null);
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [contentKey, isCompact, rowRef]);

  return { isCompact };
}
