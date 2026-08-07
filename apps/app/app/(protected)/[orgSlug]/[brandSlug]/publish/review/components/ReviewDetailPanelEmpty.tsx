'use client';

import { MousePointerClick } from 'lucide-react';

export default function ReviewDetailPanelEmpty() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-card bg-card p-8 text-center shadow-border">
      <div className="rounded-card border border-border bg-background p-3">
        <MousePointerClick className="size-6 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-sm font-semibold text-foreground">
        Select a post to review
      </h2>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        Pick an item from the queue to inspect the caption, draft, and decision
        actions.
      </p>
    </div>
  );
}
