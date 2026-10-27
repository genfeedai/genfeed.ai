import { Progress } from '@ui/primitives/progress';
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
      <Progress
        className="bg-muted"
        indicatorClassName="bg-rose-500"
        value={progress}
      />
    </div>
  );
}
