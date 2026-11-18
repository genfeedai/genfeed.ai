'use client';

import { Skeleton } from '@ui/primitives/skeleton';
import type { AppRailPreviewLoadingProps } from '@/props/ui/app-rail-preview.props';

const SKELETON_KEYS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

/** Placeholder rows that keep the preview's height steady while data arrives. */
export function RailPreviewLoading({ rows = 3 }: AppRailPreviewLoadingProps) {
  return (
    <div
      aria-busy="true"
      className="flex flex-col gap-3 px-2.5 py-2"
      data-testid="app-rail-preview-loading"
    >
      {SKELETON_KEYS.slice(0, rows).map((key) => (
        <div className="flex items-center gap-2.5" key={key}>
          <Skeleton className="size-8 shrink-0" variant="rounded" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-3/4" variant="text" />
            <Skeleton className="h-2.5 w-1/2" variant="text" />
          </div>
        </div>
      ))}
    </div>
  );
}
