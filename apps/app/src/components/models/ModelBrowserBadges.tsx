'use client';

import type {
  ModelCapability,
  ModelUseCase,
  ProviderType,
} from '@genfeedai/types';
import { ModelCapabilityEnum, ProviderTypeEnum } from '@genfeedai/types';
import {
  PROVIDER_COLORS,
  USE_CASE_CONFIG,
} from './model-browser-badges.constants';

// =============================================================================
// PROVIDER BADGE
// =============================================================================

export function ProviderBadge({ provider }: { provider: ProviderType }) {
  const labels: Record<ProviderType, string> = {
    [ProviderTypeEnum.REPLICATE]: 'Replicate',
    [ProviderTypeEnum.FAL]: 'fal.ai',
    [ProviderTypeEnum.HUGGINGFACE]: 'Hugging Face',
    [ProviderTypeEnum.GENFEED_AI]: 'Genfeed AI',
  };

  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${PROVIDER_COLORS[provider]}`}
    >
      {labels[provider]}
    </span>
  );
}

// =============================================================================
// CAPABILITY BADGE
// =============================================================================

export function CapabilityBadge({
  capability,
}: {
  capability: ModelCapability;
}) {
  const labels: Record<ModelCapability, string> = {
    [ModelCapabilityEnum.TEXT_TO_IMAGE]: 'txt->img',
    [ModelCapabilityEnum.IMAGE_TO_IMAGE]: 'img->img',
    [ModelCapabilityEnum.TEXT_TO_VIDEO]: 'txt->vid',
    [ModelCapabilityEnum.IMAGE_TO_VIDEO]: 'img->vid',
    [ModelCapabilityEnum.TEXT_GENERATION]: 'txt->txt',
  };

  return (
    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {labels[capability]}
    </span>
  );
}

// =============================================================================
// USE CASE BADGE
// =============================================================================

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
