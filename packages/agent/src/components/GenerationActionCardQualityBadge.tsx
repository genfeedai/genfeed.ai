import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { RefreshCw } from 'lucide-react';
import type { ReactElement } from 'react';

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
      <div className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
        ✨ Quality: {score}/10
      </div>
    );
  }

  if (score < 6) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
          ⚠️ Quality: {score}/10
        </div>
        {feedback && feedback.length > 0 && (
          <p className="text-xs text-muted-foreground">{feedback[0]}</p>
        )}
        {onRegenerate && (
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.XS}
            onClick={onRegenerate}
            className="border-warning/30 bg-warning/10 text-warning hover:bg-warning/15"
          >
            <RefreshCw className="size-3" />
            Regenerate
          </Button>
        )}
      </div>
    );
  }

  // Score 6-7: neutral display
  return (
    <div className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      Quality: {score}/10
    </div>
  );
}
