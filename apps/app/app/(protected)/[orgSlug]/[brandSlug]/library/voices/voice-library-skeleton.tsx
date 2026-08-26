'use client';

export default function VoiceLibrarySkeleton() {
  return (
    <div className="space-y-3" data-testid="voice-row-skeleton">
      {Array.from({ length: 6 }, (_, index) => index + 1).map((slot) => (
        <div
          key={`voice-row-skeleton-${slot}`}
          className="h-20 animate-pulse rounded-card bg-card shadow-border"
        />
      ))}
    </div>
  );
}
