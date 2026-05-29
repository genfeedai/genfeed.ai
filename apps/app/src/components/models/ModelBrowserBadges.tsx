'use client';

import type {
  ModelCapability,
  ModelUseCase,
  ProviderType,
} from '@genfeedai/types';
import {
  ModelCapabilityEnum,
  ModelUseCaseEnum,
  ProviderTypeEnum,
} from '@genfeedai/types';
import { Layers, Palette, Repeat, Sparkles, User, ZoomIn } from 'lucide-react';

// =============================================================================
// PROVIDER BADGE
// =============================================================================

export const PROVIDER_COLORS: Record<ProviderType, string> = {
  [ProviderTypeEnum.REPLICATE]:
    'bg-blue-500/10 text-blue-500 border-blue-500/20',
  [ProviderTypeEnum.FAL]:
    'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  [ProviderTypeEnum.HUGGINGFACE]:
    'bg-orange-500/10 text-orange-500 border-orange-500/20',
  [ProviderTypeEnum.GENFEED_AI]:
    'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
};

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
// USE CASE CONFIG + BADGE
// =============================================================================

export const USE_CASE_CONFIG: Record<
  ModelUseCase,
  { label: string; icon: typeof Sparkles }
> = {
  [ModelUseCaseEnum.STYLE_TRANSFER]: { icon: Palette, label: 'Style Transfer' },
  [ModelUseCaseEnum.CHARACTER_CONSISTENT]: {
    icon: User,
    label: 'Character Consistent',
  },
  [ModelUseCaseEnum.IMAGE_VARIATION]: {
    icon: Repeat,
    label: 'Image Variation',
  },
  [ModelUseCaseEnum.INPAINTING]: { icon: Layers, label: 'Inpainting' },
  [ModelUseCaseEnum.UPSCALE]: { icon: ZoomIn, label: 'Upscale' },
  [ModelUseCaseEnum.GENERAL]: { icon: Sparkles, label: 'General' },
};

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
