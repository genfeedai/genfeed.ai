'use client';

export function GenerateEmptyState() {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-foreground/45">
        Studio
      </span>
      <h2 className="text-2xl font-semibold text-foreground">
        Start with a prompt, then refine in place.
      </h2>
      <p className="max-w-xl text-sm text-foreground/60">
        The composer stays docked while you iterate, compare outputs, and queue
        generations without the UI jumping between modes.
      </p>
    </div>
  );
}
