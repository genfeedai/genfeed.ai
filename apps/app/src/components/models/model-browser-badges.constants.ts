import type { ModelUseCase, ProviderType } from '@genfeedai/types';
import { ModelUseCaseEnum, ProviderTypeEnum } from '@genfeedai/types';
import { Layers, Palette, Repeat, Sparkles, User, ZoomIn } from 'lucide-react';

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
