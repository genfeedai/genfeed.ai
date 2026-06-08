'use client';

import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { HiCursorArrowRays } from 'react-icons/hi2';

export default function ReviewDetailPanelEmpty() {
  return (
    <InsetSurface className="flex min-h-[720px] flex-col items-center justify-center p-8 text-center">
      <div className="rounded-full border border-white/10 bg-white/[0.03] p-5">
        <HiCursorArrowRays className="size-8 text-foreground/50" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-foreground">
        Select an item to review
      </h2>
      <p className="mt-2 max-w-md text-sm text-foreground/55">
        Pick a post from the queue to inspect the creative, caption, prompt, and
        scheduling details before you approve or reject it.
      </p>
    </InsetSurface>
  );
}
