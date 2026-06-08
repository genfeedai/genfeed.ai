'use client';

export default function VoiceLibrarySkeleton() {
  return (
    <div className="space-y-3" data-testid="voice-row-skeleton">
      {Array.from({ length: 6 }, (_, index) => index + 1).map((slot) => (
        <div
          key={`voice-row-skeleton-${slot}`}
          className="h-20 animate-pulse rounded-2xl border border-white/[0.08] bg-white/[0.03]"
        />
      ))}
    </div>
  );
}
