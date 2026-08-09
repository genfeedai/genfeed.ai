import { CostTier, ModelCategory, ModelProvider } from '@genfeedai/enums';
import { MODEL_KEYS } from './model-keys.constant';

/**
 * Curated media defaults for the model registry seed.
 *
 * Cost notes (USD / image, Replicate list price at last review):
 * - FLUX Schnell ~$0.003 — cheapest production image model; preferred when
 *   `prioritize=cost` / Lowest Cost.
 * - Nano Banana ~$0.039 — quality-biased platform default for balanced runs.
 *   Do not treat as the "cheap" pick; it is ~13× Schnell.
 */
export const SELF_HOSTED_MODELS = [
  {
    category: ModelCategory.IMAGE,
    cost: 0.039,
    costTier: CostTier.MEDIUM,
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
    costTier: CostTier.HIGH,
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
    costTier: CostTier.MEDIUM,
    description: 'Replicate Nano Banana 2 image generation model',
    isDefault: false,
    isHighlighted: false,
    key: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2,
    label: 'Nano Banana 2',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'nano-banana-2', owner: 'google' },
  },
  {
    category: ModelCategory.IMAGE,
    cost: 0.003,
    costTier: CostTier.LOW,
    description: 'Replicate FLUX Schnell image generation model',
    isDefault: false,
    isHighlighted: true,
    key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    label: 'FLUX Schnell',
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'flux-schnell', owner: 'black-forest-labs' },
  },
] as const;
