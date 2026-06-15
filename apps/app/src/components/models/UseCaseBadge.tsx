'use client';

import type { ModelUseCase } from '@genfeedai/types';
import { USE_CASE_CONFIG } from './model-browser-badges.constants';

export function UseCaseBadge({ useCase }: { useCase: ModelUseCase }) {
  const config = USE_CASE_CONFIG[useCase];
  if (!config || useCase === 'general') return null;
  const Icon = config.icon;

  return (
    <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400 border border-purple-500/20">
      <Icon className="size-2.5" />
      {config.label}
    </span>
  );
}

export default UseCaseBadge;
