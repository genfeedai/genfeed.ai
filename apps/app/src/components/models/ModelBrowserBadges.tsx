'use client';

import type { ProviderType } from '@genfeedai/types';
import { ProviderTypeEnum } from '@genfeedai/types';
import { PROVIDER_COLORS } from './model-browser-badges.constants';

export { CapabilityBadge } from './CapabilityBadge';
export { UseCaseBadge } from './UseCaseBadge';

// =============================================================================
// PROVIDER BADGE
// =============================================================================

const PROVIDER_LABELS: Record<ProviderType, string> = {
  [ProviderTypeEnum.REPLICATE]: 'Replicate',
  [ProviderTypeEnum.FAL]: 'fal.ai',
  [ProviderTypeEnum.HUGGINGFACE]: 'Hugging Face',
  [ProviderTypeEnum.GENFEED_AI]: 'Genfeed AI',
};

export function ProviderBadge({ provider }: { provider: ProviderType }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${PROVIDER_COLORS[provider]}`}
    >
      {PROVIDER_LABELS[provider]}
    </span>
  );
}
