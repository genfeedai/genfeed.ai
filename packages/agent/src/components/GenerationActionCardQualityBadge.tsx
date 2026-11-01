import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Badge } from '@ui/primitives/badge';
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
      <Badge casing="normal" shape="pill" size="lg" variant="success">
        ✨ Quality: {score}/10
      </Badge>
    );
  }

  if (score < 6) {
    return (
      <div className="space-y-1">
        <Badge casing="normal" shape="pill" size="lg" variant="warning">
          ⚠️ Quality: {score}/10
        </Badge>
        {feedback && feedback.length > 0 && (
          <p className="text-xs text-muted-foreground">{feedback[0]}</p>
        )}
        {onRegenerate && (
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.XS}
            onClick={onRegenerate}
            className="border-warning/20 bg-warning/10 text-warning hover:bg-warning/10"
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
    <Badge casing="normal" shape="pill" size="lg" variant="secondary">
      Quality: {score}/10
    </Badge>
  );
}
