'use client';

import type { ModelUseCase } from '@genfeedai/contracts/types';
import { Badge } from '@ui/primitives/badge';
import { USE_CASE_CONFIG } from './model-browser-badges.constants';

export function UseCaseBadge({ useCase }: { useCase: ModelUseCase }) {
  const config = USE_CASE_CONFIG[useCase];
  if (!config || useCase === 'general') return null;
  const Icon = config.icon;

  return (
    <Badge icon={<Icon />} variant="secondary">
      {config.label}
    </Badge>
  );
}
