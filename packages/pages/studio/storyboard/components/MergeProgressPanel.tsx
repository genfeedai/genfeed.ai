'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { StoryboardMergeProgressPanelProps } from '@genfeedai/props/studio/storyboard.props';
import { Button } from '@ui/primitives/button';
import MergeProgressBars from '@ui/storyboard/merge-progress-bars/MergeProgressBars';
import { X } from 'lucide-react';

export default function MergeProgressPanel({
  overallProgress,
  steps,
  onDismiss,
}: StoryboardMergeProgressPanelProps) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Rendering merged video
        </span>
        {/* Progress arrives over the socket; if that stream dies the panel
            would otherwise pin the merge buttons forever. */}
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          icon={<X className="size-3.5" />}
          label="Stop watching"
          onClick={onDismiss}
        />
      </div>
      <MergeProgressBars steps={steps} overallProgress={overallProgress} />
    </div>
  );
}
