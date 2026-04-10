import { ComponentSize } from '@genfeedai/enums';
import type { BadgeQuotaProps } from '@genfeedai/props/ui/display/badge.props';
import Badge from '@ui/display/badge/Badge';

function getVariant(
  isExceeded: boolean,
  isNearLimit: boolean,
): 'error' | 'warning' | 'success' {
  if (isExceeded) {
    return 'error';
  }
  if (isNearLimit) {
    return 'warning';
  }
  return 'success';
}

export default function BadgeQuota({
  currentCount,
  dailyLimit,
  platform,
  size = ComponentSize.MD,
  showLabel = true,
}: BadgeQuotaProps): React.ReactElement {
  const percentage = dailyLimit > 0 ? (currentCount / dailyLimit) * 100 : 0;
  const isExceeded = currentCount >= dailyLimit;
  const isNearLimit = percentage >= 80 && !isExceeded;
  const variant = getVariant(isExceeded, isNearLimit);

  return (
    <div className="flex items-center gap-2">
      {showLabel && platform && (
        <span className="text-sm text-foreground/70 capitalize">
          {platform}:
        </span>
      )}
      <Badge variant={variant} size={size} className="font-medium">
        <span
          title={
            isExceeded
              ? 'Quota exceeded. Resets at midnight UTC.'
              : `${dailyLimit - currentCount} posts remaining today`
          }
        >
          {currentCount}/{dailyLimit}
        </span>
      </Badge>
      {isExceeded && <span className="text-xs text-error">Quota exceeded</span>}
    </div>
  );
}
