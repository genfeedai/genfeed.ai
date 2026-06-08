import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { HiArrowPath } from 'react-icons/hi2';

type GenerationActionCardQualityBadgeProps = {
  score: number;
  feedback?: string[];
  onRegenerate?: () => void;
};

export function GenerationActionCardQualityBadge({
  score,
  feedback,
  onRegenerate,
}: GenerationActionCardQualityBadgeProps): ReactElement | null {
  if (score >= 8) {
    return (
      <div className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
        ✨ Quality: {score}/10
      </div>
    );
  }

  if (score < 6) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          ⚠️ Quality: {score}/10
        </div>
        {feedback && feedback.length > 0 && (
          <p className="text-xs text-muted-foreground">{feedback[0]}</p>
        )}
        {onRegenerate && (
          <Button
            variant={ButtonVariant.OUTLINE}
            size={ButtonSize.XS}
            onClick={onRegenerate}
            className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
          >
            <HiArrowPath className="size-3" />
            Regenerate
          </Button>
        )}
      </div>
    );
  }

  // Score 6-7: neutral display
  return (
    <div className="flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      Quality: {score}/10
    </div>
  );
}
