import type { ReactElement } from 'react';

type VoiceCloneProgressProps = {
  progress: number;
};

export function VoiceCloneProgress({
  progress,
}: VoiceCloneProgressProps): ReactElement {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>Cloning in progress…</span>
        <span>{progress}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-rose-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
