'use client';

import { MessageSquare, MousePointerClick } from 'lucide-react';

export default function ReviewDetailPanelEmpty() {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-card bg-card p-6 text-center shadow-border">
      <div className="flex items-center gap-2">
        <div className="rounded-card border border-border bg-background p-2.5">
          <MousePointerClick className="size-5 text-muted-foreground" />
        </div>
        <div className="rounded-card border border-border bg-background p-2.5">
          <MessageSquare className="size-5 text-muted-foreground" />
        </div>
      </div>
      <h2 className="mt-4 text-sm font-semibold text-foreground">
        Select a row or talk to the agent
      </h2>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
        Click a post in the table to load its review context here. With nothing
        selected, use Conversation to triage the queue.
      </p>
    </div>
  );
}
