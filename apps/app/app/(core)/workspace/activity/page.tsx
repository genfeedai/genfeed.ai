'use client';

import { Activity } from 'lucide-react';

export default function WorkspaceActivityPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Execution history and system events.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--secondary)]">
          <Activity className="h-8 w-8 text-[var(--muted-foreground)]" />
        </div>
        <h2 className="text-lg font-medium">Coming soon</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Execution activity feed and run history.
        </p>
      </div>
    </div>
  );
}
