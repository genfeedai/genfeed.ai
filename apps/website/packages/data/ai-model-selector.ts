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
  { label: 'Default picks', value: 'default' },
  { label: 'Lower cost', value: 'cost' },
  { label: 'Faster drafts', value: 'speed' },
  { label: 'Higher quality', value: 'quality' },
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
    question: 'Is the AI model selector free, with no signup?',
    answer:
      'Yes. You can compare catalog matches and copy your shortlist without an account, API key, or payment. Generating content in Genfeed is a separate product action and may use paid credits.',
  },
  {
    question: 'Which AI model should I use for content creation?',
    answer:
      'Start with the output you need: images, video, writing, voice, or music. Then choose a priority and, for images or video, an aspect ratio. The selector returns models listed for that format in Genfeed. Test a small draft before committing to a full campaign.',
  },
  {
    question: 'How are AI models compared here?',
    answer:
      'Matches use the public product registry. Lower cost, faster drafts, and higher quality sort by the recorded relative tiers, with the format default breaking ties. Missing tiers are shown as not listed and sort after known tiers. These are catalog signals, not measured benchmark scores or exact prices.',
  },
  {
    question:
      'Does this tool generate AI content or send my prompt to a model?',
    answer:
      'No. It helps you choose a model; it does not run a prompt or generate media. Filters run in your browser after the catalog loads. Search text is not submitted to the API.',
  },
  {
    question: 'What if no AI model matches my requirements?',
    answer:
      'Clear the name search or choose any aspect ratio. A model with no recorded aspect ratios cannot satisfy a specific orientation filter. If a format has no listed models, the selector says so instead of inventing recommendations.',
  },
] as const;

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
