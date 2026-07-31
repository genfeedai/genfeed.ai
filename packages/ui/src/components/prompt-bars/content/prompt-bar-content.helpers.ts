import { Platform } from '@genfeedai/enums';
import {
  isPostPlatform,
  type PostPlatform,
} from '@genfeedai/helpers/content/posts.helper';

export const POST_COUNT_OPTIONS = [
  { key: '1', label: '1x' },
  { key: '2', label: '2x' },
  { key: '3', label: '3x' },
  { key: '5', label: '5x' },
  { key: '10', label: '10x' },
];

export const POST_COUNT_CYCLE: Record<number, number> = {
  1: 2,
  2: 3,
  3: 5,
  5: 10,
  10: 1,
};

export const DEFAULT_PLATFORMS = [
  Platform.YOUTUBE,
  Platform.INSTAGRAM,
  Platform.TWITTER,
  Platform.TIKTOK,
] satisfies PostPlatform[];

export const CONTROL_CLASS =
  'h-9 px-3 gap-2 flex-shrink-0 !border-white/10 !bg-white/[0.03] text-white/80 hover:!bg-white/[0.06] hover:text-white';

export const COLLAPSE_BUTTON_CLASS =
  'size-8 bg-black/20 p-0 text-white/70 shadow-border backdrop-blur-sm hover:bg-black/30 hover:text-white';

/** Copy used whenever the bar enhances existing content rather than generating new. */
export const DEFAULT_ENHANCEMENT_PLACEHOLDER =
  'Describe how you want to enhance your content…';

const GENERATION_PLACEHOLDERS: Record<PostPlatform | 'all', string> = {
  all: 'e.g., AI productivity tips, startup advice, tech trends…',
  [Platform.TWITTER]: 'e.g., viral tweet ideas, trending topics, quick tips…',
  [Platform.INSTAGRAM]: 'e.g., visual content ideas, story concepts, captions…',
  [Platform.YOUTUBE]: 'e.g., video topics, tutorial ideas, content series…',
  [Platform.TIKTOK]:
    'e.g., trending challenges, short-form content, viral ideas…',
  [Platform.FACEBOOK]: 'e.g., community posts, engagement content, updates…',
  [Platform.LINKEDIN]:
    'e.g., professional insights, industry thoughts, career tips…',
  [Platform.PINTEREST]: 'e.g., pin ideas, visual inspiration, DIY projects…',
  [Platform.REDDIT]: 'e.g., discussion topics, AMA questions, community posts…',
  [Platform.DISCORD]: 'e.g., community announcements, discussion prompts…',
  [Platform.TELEGRAM]: 'e.g., channel updates, news sharing, tips…',
  [Platform.THREADS]: 'e.g., conversational threads, community discussions…',
  [Platform.TWITCH]:
    'e.g., stream topics, gaming content, community engagement…',
  [Platform.MEDIUM]: 'e.g., article topics, deep dives, thought leadership…',
  [Platform.FANVUE]:
    'e.g., exclusive creator content, fan engagement, premium posts…',
  [Platform.SLACK]: 'e.g., team updates, announcements, workspace discussions…',
  [Platform.WORDPRESS]: 'e.g., blog posts, tutorials, long-form articles…',
  [Platform.SNAPCHAT]: 'e.g., snap stories, visual content, quick updates…',
  [Platform.WHATSAPP]:
    'e.g., broadcast messages, status updates, group content…',
  [Platform.MASTODON]: 'e.g., community posts, federated discussions, toots…',
  [Platform.GHOST]: 'e.g., newsletter content, blog articles, member posts…',
  [Platform.SHOPIFY]: 'e.g., product descriptions, store updates, promotions…',
  [Platform.BEEHIIV]:
    'e.g., newsletter topics, subscriber updates, curated content…',
  [Platform.UNIPILE]:
    'e.g., outreach replies, meeting follow-ups, inbox summaries…',
  [Platform.GOOGLE_ADS]: 'e.g., ad copy, campaign ideas, keyword strategies…',
};

/**
 * Placeholder precedence: explicit override → platform-aware generation copy
 * (only when the bar generates new content) → generic enhancement copy.
 */
export function resolvePromptBarContentPlaceholder({
  placeholder,
  platform,
  isGenerating,
}: {
  isGenerating: boolean;
  placeholder?: string;
  platform: Platform | 'all';
}): string {
  if (placeholder) {
    return placeholder;
  }

  if (!isGenerating) {
    return DEFAULT_ENHANCEMENT_PLACEHOLDER;
  }

  return platform !== 'all' && isPostPlatform(platform)
    ? GENERATION_PLACEHOLDERS[platform]
    : GENERATION_PLACEHOLDERS.all;
}
