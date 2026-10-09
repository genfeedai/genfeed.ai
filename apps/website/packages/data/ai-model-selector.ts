import { CostTier, QualityTier, SpeedTier } from '@genfeedai/contracts';
import type { PublicModelCatalogItem } from '@public/models/models-loader';

export const MODEL_FORMATS = [
  { label: 'Images', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Writing', value: 'text' },
  { label: 'Voice', value: 'voice' },
  { label: 'Music', value: 'music' },
] as const;

export const MODEL_PRIORITIES = [
  { label: 'Default', value: 'default' },
  { label: 'Cost', value: 'cost' },
  { label: 'Speed', value: 'speed' },
  { label: 'Quality', value: 'quality' },
] as const;

export type ModelFormat = (typeof MODEL_FORMATS)[number]['value'];
export type ModelPriority = (typeof MODEL_PRIORITIES)[number]['value'];
export type ModelOrientation = 'any' | 'portrait' | 'landscape' | 'square';

const COST_ORDER: Record<string, number> = {
  [CostTier.LOW]: 0,
  [CostTier.MEDIUM]: 1,
  [CostTier.HIGH]: 2,
};
const SPEED_ORDER: Record<string, number> = {
  [SpeedTier.FAST]: 0,
  [SpeedTier.MEDIUM]: 1,
  [SpeedTier.SLOW]: 2,
};
const QUALITY_ORDER: Record<string, number> = {
  [QualityTier.ULTRA]: 0,
  [QualityTier.HIGH]: 1,
  [QualityTier.STANDARD]: 2,
  [QualityTier.BASIC]: 3,
};

function priorityRank(
  model: PublicModelCatalogItem,
  priority: ModelPriority,
): number {
  if (priority === 'cost') return COST_ORDER[model.costTier ?? ''] ?? 4;
  if (priority === 'speed') return SPEED_ORDER[model.speedTier ?? ''] ?? 4;
  if (priority === 'quality')
    return QUALITY_ORDER[model.qualityTier ?? ''] ?? 4;
  return 0;
}

export function matchesOrientation(
  ratio: string,
  orientation: ModelOrientation,
): boolean {
  if (orientation === 'any') return true;
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) return false;
  if (orientation === 'square') return width === height;
  return orientation === 'portrait' ? width < height : width > height;
}

/** Registry matching, not an inference call or a benchmark ranking. */
export function selectModels(
  models: readonly PublicModelCatalogItem[],
  format: ModelFormat,
  priority: ModelPriority,
  orientation: ModelOrientation = 'any',
  query = '',
): PublicModelCatalogItem[] {
  const search = query.trim().toLowerCase();
  return models
    .filter((model) => {
      if (model.category !== format) return false;
      if (
        search &&
        !`${model.label} ${model.provider} ${model.key}`
          .toLowerCase()
          .includes(search)
      )
        return false;
      if ((format === 'image' || format === 'video') && orientation !== 'any') {
        return model.aspectRatios.some((ratio) =>
          matchesOrientation(ratio, orientation),
        );
      }
      return true;
    })
    .sort(
      (left, right) =>
        priorityRank(left, priority) - priorityRank(right, priority) ||
        Number(right.isDefault) - Number(left.isDefault) ||
        left.label.localeCompare(right.label) ||
        left.key.localeCompare(right.key),
    );
}

export const MODEL_SELECTOR_FAQ = [
  {
    question: 'Is the AI model selector free?',
    answer:
      'Yes. Get instant matches without signup or an API key. Creating content in Genfeed may use paid credits.',
  },
  {
    question: 'How are AI models compared?',
    answer:
      'Choose a format, then sort by the catalog’s cost, speed, or quality tiers. Missing tiers sort last; the format default breaks ties. These labels are not benchmark scores.',
  },
  {
    question: 'Are the examples benchmark results?',
    answer:
      'No. They are provider examples from Replicate, made with different prompts and settings. The linked Genfeed benchmark reports only recorded judged matches.',
  },
] as const;

/** Public provider examples, checked 2026-10-08. Exact model keys only. */
export const MODEL_EXAMPLES: Record<
  string,
  { src: string; source: string; alt: string }
> = {
  'google/nano-banana-2-lite': {
    src: 'https://replicate.delivery/xezq/uTjeeWCfjuSJOJGTnewlGqXjFKVoR8nr4ep8oL7I3kff4YOaLA/tmpmlo3k05y.jpeg',
    source:
      'https://replicate.com/google/nano-banana-2-lite?prediction=erw1rfhng1rmy0cz383txf94rm',
    alt: 'Nano Banana 2 Lite provider example: a monkey portrait with model name lettering',
  },
  'black-forest-labs/flux-1.1-pro': {
    src: 'https://replicate.delivery/czjl/XetPfMnnBtnyLUNiNcnl2Hneyeo8AsfsOl2AG5Znql5f3VK9E/tmpuv7lgrx7.jpg',
    source: 'https://replicate.com/black-forest-labs/flux-1.1-pro',
    alt: 'FLUX 1.1 Pro provider example: a black forest cake with lettering',
  },
  'black-forest-labs/flux-2-pro': {
    src: 'https://replicate.delivery/xezq/EXuyWm6qQuK9J19lUCtc9sbO4k2RyHwoOP6GoYMCpeyM4a2KA/tmpzd16m4x2.webp',
    source:
      'https://replicate.com/black-forest-labs/flux-2-pro?prediction=rwn48vjygdrma0ctqcgbrd06t4',
    alt: 'FLUX 2 Pro provider example: colorful lettering beside a swimming pool',
  },
};

export const MODEL_SELECTOR_PATH = '/tools/ai-model-selector';
export const MODEL_SELECTOR_TITLE =
  'Free AI Model Selector for Content Creation';
export const MODEL_SELECTOR_DESCRIPTION =
  'Find AI models for images, video, writing, voice, and music. Compare catalog matches instantly by format, cost, speed, or quality. Free, no signup.';

export function modelSelectorJsonLd() {
  const url = `https://genfeed.ai${MODEL_SELECTOR_PATH}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${url}#tool`,
        applicationCategory: 'UtilitiesApplication',
        description: MODEL_SELECTOR_DESCRIPTION,
        isAccessibleForFree: true,
        name: MODEL_SELECTOR_TITLE,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        operatingSystem: 'Any',
        url,
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: MODEL_SELECTOR_FAQ.map(({ question, answer }) => ({
          '@type': 'Question',
          acceptedAnswer: { '@type': 'Answer', text: answer },
          name: question,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            item: 'https://genfeed.ai',
            name: 'Genfeed',
            position: 1,
          },
          {
            '@type': 'ListItem',
            item: 'https://genfeed.ai/tools',
            name: 'Free AI tools',
            position: 2,
          },
          {
            '@type': 'ListItem',
            item: url,
            name: 'AI model selector',
            position: 3,
          },
        ],
      },
    ],
  };
}
