import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import type { BadgeProps } from '@ui/primitives/badge';

export function getHealthBadgeVariant(
  summary: AccountHealthSummary,
): BadgeProps['variant'] {
  if (summary.override.isActive) {
    return 'info';
  }

  if (summary.holdPublishing || summary.riskLevel === 'high') {
    return 'warning';
  }

  return 'success';
}
