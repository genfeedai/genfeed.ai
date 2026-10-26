import { Skeleton } from '@ui/primitives/skeleton';

export default function VoiceLibrarySkeleton() {
  return (
    <div className="space-y-3" data-testid="voice-row-skeleton">
      {Array.from({ length: 6 }, (_, index) => index + 1).map((slot) => (
        <Skeleton
          key={`voice-row-skeleton-${slot}`}
          className="h-20 rounded-card"
        />
      ))}
    </div>
  );
}
