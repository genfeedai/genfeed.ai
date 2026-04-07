'use client';

const EDITION = process.env.NEXT_PUBLIC_GENFEED_EDITION ?? 'Core';

/**
 * Floating badge that indicates the current Genfeed edition (Core / Cloud).
 * Visible only in development to help distinguish environments.
 */
export function EditionBadge() {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className="fixed bottom-2 left-2 z-50 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-white/40 backdrop-blur-sm select-none pointer-events-none">
      {EDITION}
    </div>
  );
}
