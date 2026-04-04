import type { ReactElement } from 'react';

export function AutoPostToggle(): ReactElement {
  return (
    <label className="flex items-center justify-between opacity-50">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">Auto-post content</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
            Coming soon
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Automatically post generated content
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={false}
        disabled
        className="relative h-5 w-9 shrink-0 cursor-not-allowed rounded-full bg-border"
      >
        <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white" />
      </button>
    </label>
  );
}
