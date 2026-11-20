import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import type { BadgeProps } from '@ui/primitives/badge';

export function getHealthBadgeVariant(
  summary: AccountHealthSummary,
): BadgeProps['variant'] {
  if (summary.riskLevel === 'high') {
    return 'warning';
  }

  return 'success';
}
