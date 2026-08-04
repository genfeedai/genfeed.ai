import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import { MODEL_KEYS } from './model-keys.constant';

export const SELF_HOSTED_MODELS = [
  {
    category: ModelCategory.IMAGE,
    cost: 0.039,
    description: 'Replicate Nano Banana image generation model',
    isDefault: true,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA,
    label: 'Nano Banana',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'nano-banana', owner: 'google' },
  },
  {
    category: ModelCategory.IMAGE,
    cost: 0.134,
    description: 'Replicate Nano Banana Pro image generation model',
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_PRO,
    label: 'Nano Banana Pro',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'nano-banana-pro', owner: 'google' },
  },
  {
    category: ModelCategory.IMAGE,
    cost: 0.039,
    description: 'Replicate Nano Banana 2 image generation model',
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2,
    label: 'Nano Banana 2',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'nano-banana-2', owner: 'google' },
  },
] as const;
