/**
 * Micro-prompt for calendar Generate.
 *
 * Cadence is the campaign scope until Publish Campaigns ship. Generate writes
 * one post from the campaign brief, brand voice, and already-scheduled items
 * in that cadence. Write does not use this prompt.
 *
 * Foundation for epic #3247, child #3250.
 */

import { PostCategory } from '../..';

export const MAX_SCHEDULED_CAMPAIGN_ITEMS = 8;
export const MAX_SCHEDULED_ITEM_CHARS = 280;

export type CadenceSlotGenerateCampaign = {
  brief: string | null;
  label: string | null;
};

export type CadenceSlotScheduledItem = {
  content: string;
  instant: string;
};

export type CadenceSlotGeneratePromptInput = {
  brandDescription: string | null;
  brandLabel: string;
  brandVoice: Record<string, string | string[]> | null;
  campaign: CadenceSlotGenerateCampaign;
  format: PostCategory;
  instant: string;
  scheduledItems: CadenceSlotScheduledItem[];
  slotBrief: string | null;
  timezone: string;
};

export type CadenceSlotGeneratePrompt = {
  maxTokens: number;
  system: string;
  user: string;
};

type FormatGuide = {
  length: string;
  maxTokens: number;
};

const FORMAT_GUIDE: Record<PostCategory, FormatGuide> = {
  [PostCategory.ARTICLE]: {
    length: 'a short draft article, 400 to 700 words, with a clear title line',
    maxTokens: 900,
  },
  [PostCategory.IMAGE]: {
    length: 'an image caption, 1 to 3 sentences',
    maxTokens: 220,
  },
  [PostCategory.POST]: {
    length: 'a social caption, 40 to 150 words',
    maxTokens: 320,
  },
  [PostCategory.REEL]: {
    length: 'a short-form caption with a spoken hook, under 150 characters',
    maxTokens: 180,
  },
  [PostCategory.STORY]: {
    length: 'a story line, one short sentence',
    maxTokens: 80,
  },
  [PostCategory.TEXT]: {
    length: 'a text post or tweet, under 280 characters',
    maxTokens: 140,
  },
  [PostCategory.VIDEO]: {
    length: 'a video caption, 1 to 3 sentences',
    maxTokens: 220,
  },
};

export function trimScheduledCampaignItems(
  items: CadenceSlotScheduledItem[],
): CadenceSlotScheduledItem[] {
  return items.slice(0, MAX_SCHEDULED_CAMPAIGN_ITEMS).map((item) => ({
    content:
      item.content.length > MAX_SCHEDULED_ITEM_CHARS
        ? `${item.content.slice(0, MAX_SCHEDULED_ITEM_CHARS)}...`
        : item.content,
    instant: item.instant,
  }));
}

export function buildCadenceSlotGeneratePrompt(
  input: CadenceSlotGeneratePromptInput,
): CadenceSlotGeneratePrompt {
  const guide = FORMAT_GUIDE[input.format] ?? FORMAT_GUIDE[PostCategory.POST];
  const scheduledItems = trimScheduledCampaignItems(input.scheduledItems);
  const campaignName = input.campaign.label?.trim() || 'Untitled campaign';
  const campaignBrief = input.campaign.brief?.trim() || null;
  const slotBrief = input.slotBrief?.trim() || null;
  const brandDescription = input.brandDescription?.trim() || null;

  const system = [
    'You write one post for a brand campaign.',
    'Return only the post body.',
    'No preamble, no markdown fences, no hashtag dump unless the brief asks.',
    'Match the brand voice. Continue the campaign; do not repeat or lightly rephrase already scheduled posts.',
  ].join(' ');

  const userLines = [
    `Brand: ${input.brandLabel}`,
    brandDescription ? `Brand description: ${brandDescription}` : null,
    input.brandVoice
      ? `Brand voice: ${JSON.stringify(input.brandVoice)}`
      : null,
    `Campaign: ${campaignName}`,
    campaignBrief ? `Campaign brief: ${campaignBrief}` : null,
    `Format: ${input.format}`,
    `Publish at: ${input.instant} (${input.timezone})`,
    `Length: ${guide.length}.`,
  ];

  if (scheduledItems.length > 0) {
    userLines.push(
      'Already scheduled in this campaign:',
      ...scheduledItems.map(
        (item) => `- ${item.instant}: ${item.content.replace(/\s+/g, ' ')}`,
      ),
    );
  } else {
    userLines.push('Already scheduled in this campaign: none yet.');
  }

  userLines.push(
    slotBrief
      ? `This slot: ${slotBrief}`
      : 'This slot: write the next post in the campaign.',
  );

  return {
    maxTokens: guide.maxTokens,
    system,
    user: userLines.filter((line): line is string => Boolean(line)).join('\n'),
  };
}
