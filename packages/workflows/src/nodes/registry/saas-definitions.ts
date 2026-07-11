import {
  DEFAULT_ANALYTICS_FEEDBACK_DATA,
  DEFAULT_BRAND_ASSET_DATA,
  DEFAULT_BRAND_CONTEXT_DATA,
  DEFAULT_BRAND_DATA,
  DEFAULT_COMMENT_TRIGGER_DATA,
  DEFAULT_ENGAGEMENT_TRIGGER_DATA,
  DEFAULT_HOOK_GENERATOR_DATA,
  DEFAULT_KEYWORD_TRIGGER_DATA,
  DEFAULT_MUSIC_SOURCE_DATA,
  DEFAULT_POST_REPLY_DATA,
  DEFAULT_PUBLISH_DATA,
  DEFAULT_SEND_DM_DATA,
  DEFAULT_SOUND_OVERLAY_DATA,
  DEFAULT_TREND_HASHTAG_INSPIRATION_DATA,
  DEFAULT_TREND_SOUND_INSPIRATION_DATA,
  DEFAULT_TREND_TRIGGER_DATA,
  DEFAULT_TREND_VIDEO_INSPIRATION_DATA,
} from '../definitions';
import type { ExtendedNodeCategory, SaaSHandleDefinition } from '../types';

/**
 * SaaS-specific node types
 *
 * Keep in sync with:
 *   - packages/workflows/src/nodes/index.ts (barrel exports)
 *   - SAAS_NODE_DEFINITIONS below
 */
export type SaaSNodeType =
  // brand / context
  | 'brand'
  | 'brandAsset'
  | 'brandContext'
  // input / triggers
  | 'analyticsFeedback'
  | 'commentTrigger'
  | 'engagementTrigger'
  | 'keywordTrigger'
  | 'musicSource'
  | 'trendTrigger'
  // processing
  | 'soundOverlay'
  // AI / generation
  | 'hookGenerator'
  | 'trendHashtagInspiration'
  | 'trendSoundInspiration'
  | 'trendVideoInspiration'
  // output / publish
  | 'postReply'
  | 'publish'
  | 'sendDm';

/**
 * SaaS node category (extends core categories)
 */
export type SaaSNodeCategory = Extract<
  ExtendedNodeCategory,
  'saas' | 'input' | 'output' | 'automation' | 'processing'
>;

/**
 * Extended node definition for SaaS nodes
 */
export interface SaaSNodeDefinition {
  type: SaaSNodeType;
  label: string;
  description: string;
  category: SaaSNodeCategory;
  icon: string;
  inputs: SaaSHandleDefinition[];
  outputs: SaaSHandleDefinition[];
  defaultData: Record<string, unknown>;
}

/**
 * SaaS-specific node definitions
 *
 * These nodes are only available in the SaaS platform
 * and extend the core workflow functionality with
 * multi-tenant features like brand context and assets.
 */
export const SAAS_NODE_DEFINITIONS: Record<SaaSNodeType, SaaSNodeDefinition> = {
  brand: {
    category: 'input',
    defaultData: DEFAULT_BRAND_DATA as Record<string, unknown>,
    description:
      'Select a brand from your organization to inject brand context',
    icon: 'Store',
    inputs: [],
    label: 'Brand',
    outputs: [
      { id: 'brand', label: 'Brand Context', type: 'brand' },
      { id: 'voice', label: 'Voice', type: 'text' },
      { id: 'colors', label: 'Colors', type: 'object' },
      { id: 'fonts', label: 'Fonts', type: 'object' },
    ],
    type: 'brand',
  },
  brandAsset: {
    category: 'saas',
    defaultData: DEFAULT_BRAND_ASSET_DATA as Record<string, unknown>,
    description: 'Resolve brand logos, banners, and reference images',
    icon: 'ImageIcon',
    inputs: [],
    label: 'Brand Asset',
    outputs: [
      { id: 'image', label: 'Asset', type: 'image' },
      {
        id: 'images',
        label: 'Reference Images',
        multiple: true,
        type: 'image',
      },
    ],
    type: 'brandAsset',
  },
  brandContext: {
    category: 'saas',
    defaultData: DEFAULT_BRAND_CONTEXT_DATA as Record<string, unknown>,
    description:
      'Inject brand voice, colors, fonts, and default models into workflow',
    icon: 'Palette',
    inputs: [],
    label: 'Brand Context',
    outputs: [
      { id: 'voice', label: 'Brand Voice', type: 'text' },
      { id: 'colors', label: 'Color Palette', type: 'text' },
      { id: 'fonts', label: 'Font Family', type: 'text' },
      { id: 'models', label: 'Default Models', type: 'text' },
    ],
    type: 'brandContext',
  },
  commentTrigger: {
    category: 'automation',
    defaultData: DEFAULT_COMMENT_TRIGGER_DATA as Record<string, unknown>,
    description: 'Start workflow when a social comment is detected',
    icon: 'MessageCircle',
    inputs: [],
    label: 'Comment Trigger',
    outputs: [
      { id: 'commentId', label: 'Comment ID', type: 'text' },
      { id: 'contentId', label: 'Content ID', type: 'text' },
      { id: 'contentUrl', label: 'Content URL', type: 'text' },
      { id: 'text', label: 'Comment Text', type: 'text' },
      { id: 'authorId', label: 'Author ID', type: 'text' },
      { id: 'authorUsername', label: 'Author Username', type: 'text' },
      { id: 'platform', label: 'Platform', type: 'text' },
    ],
    type: 'commentTrigger',
  },
  engagementTrigger: {
    category: 'automation',
    defaultData: DEFAULT_ENGAGEMENT_TRIGGER_DATA as Record<string, unknown>,
    description:
      'Start workflow when engagement metrics (likes, comments, shares, views) hit a threshold',
    icon: 'BarChart2',
    inputs: [],
    label: 'Engagement Trigger',
    outputs: [
      { id: 'postId', label: 'Post ID', type: 'text' },
      { id: 'postUrl', label: 'Post URL', type: 'text' },
      { id: 'metricType', label: 'Metric Type', type: 'text' },
      { id: 'currentValue', label: 'Current Value', type: 'number' },
      { id: 'threshold', label: 'Threshold', type: 'number' },
      { id: 'platform', label: 'Platform', type: 'text' },
    ],
    type: 'engagementTrigger',
  },
  keywordTrigger: {
    category: 'automation',
    defaultData: DEFAULT_KEYWORD_TRIGGER_DATA as Record<string, unknown>,
    description:
      'Start workflow when a keyword or phrase is detected in social posts',
    icon: 'Search',
    inputs: [],
    label: 'Keyword Trigger',
    outputs: [
      { id: 'postId', label: 'Post ID', type: 'text' },
      { id: 'postUrl', label: 'Post URL', type: 'text' },
      { id: 'text', label: 'Post Text', type: 'text' },
      { id: 'matchedKeyword', label: 'Matched Keyword', type: 'text' },
      { id: 'authorId', label: 'Author ID', type: 'text' },
      { id: 'authorUsername', label: 'Author Username', type: 'text' },
      { id: 'platform', label: 'Platform', type: 'text' },
    ],
    type: 'keywordTrigger',
  },
  musicSource: {
    category: 'input',
    defaultData: DEFAULT_MUSIC_SOURCE_DATA as Record<string, unknown>,
    description: 'Resolve music from trends, library, upload, or AI generation',
    icon: 'Music',
    inputs: [
      { id: 'uploadUrl', label: 'Upload URL', required: false, type: 'text' },
      {
        id: 'generatePrompt',
        label: 'AI Prompt',
        required: false,
        type: 'text',
      },
    ],
    label: 'Music Source',
    outputs: [
      { id: 'musicUrl', label: 'Music URL', type: 'text' },
      { id: 'duration', label: 'Duration (s)', type: 'number' },
      { id: 'tempo', label: 'Tempo (BPM)', type: 'number' },
      { id: 'title', label: 'Title', type: 'text' },
    ],
    type: 'musicSource',
  },
  postReply: {
    category: 'automation',
    defaultData: DEFAULT_POST_REPLY_DATA as Record<string, unknown>,
    description:
      'Reply to a social media post or Messages conversation on Twitter, Instagram, Threads, Facebook, or YouTube',
    icon: 'MessageSquare',
    inputs: [
      { id: 'brand', label: 'Brand', required: true, type: 'brand' },
      { id: 'postId', label: 'Post ID', type: 'text' },
      { id: 'conversationId', label: 'Conversation ID', type: 'text' },
      { id: 'text', label: 'Reply Text', required: true, type: 'text' },
    ],
    label: 'Post Reply',
    outputs: [
      { id: 'replyId', label: 'Reply ID', type: 'text' },
      { id: 'replyUrl', label: 'Reply URL', type: 'text' },
    ],
    type: 'postReply',
  },
  publish: {
    category: 'output',
    defaultData: DEFAULT_PUBLISH_DATA as Record<string, unknown>,
    description: 'Publish content to Twitter, Instagram, TikTok, or LinkedIn',
    icon: 'Share2',
    inputs: [
      { id: 'brand', label: 'Brand', required: true, type: 'brand' },
      { id: 'media', label: 'Media', required: true, type: 'any' },
      { id: 'caption', label: 'Caption', type: 'text' },
    ],
    label: 'Publish',
    outputs: [],
    type: 'publish',
  },
  sendDm: {
    category: 'automation',
    defaultData: DEFAULT_SEND_DM_DATA as Record<string, unknown>,
    description:
      'Send a direct message on Twitter, Instagram, or a supported Messages conversation',
    icon: 'Send',
    inputs: [
      { id: 'brand', label: 'Brand', required: true, type: 'brand' },
      {
        id: 'recipientId',
        label: 'Recipient ID',
        type: 'text',
      },
      { id: 'conversationId', label: 'Conversation ID', type: 'text' },
      { id: 'text', label: 'Message Text', required: true, type: 'text' },
    ],
    label: 'Send DM',
    outputs: [{ id: 'messageId', label: 'Message ID', type: 'text' }],
    type: 'sendDm',
  },
  soundOverlay: {
    category: 'processing',
    defaultData: DEFAULT_SOUND_OVERLAY_DATA as Record<string, unknown>,
    description: 'Add audio track to video via FFmpeg',
    icon: 'Volume2',
    inputs: [
      { id: 'videoUrl', label: 'Video URL', required: true, type: 'text' },
      { id: 'soundUrl', label: 'Sound URL', required: true, type: 'text' },
    ],
    label: 'Sound Overlay',
    outputs: [{ id: 'videoUrl', label: 'Output Video', type: 'text' }],
    type: 'soundOverlay',
  },

  // ----- nodes added in barrel but missing from registry -----

  analyticsFeedback: {
    category: 'input',
    defaultData: DEFAULT_ANALYTICS_FEEDBACK_DATA as Record<string, unknown>,
    description: 'Read performance analytics to guide content strategy',
    icon: 'BarChart3',
    inputs: [],
    label: 'Analytics Feedback',
    outputs: [
      { id: 'topTopics', label: 'Top Topics', type: 'text' },
      { id: 'topHooks', label: 'Top Hooks', type: 'text' },
      { id: 'worstTopics', label: 'Worst Topics', type: 'text' },
      { id: 'bestPlatform', label: 'Best Platform', type: 'text' },
      { id: 'avgEngagementRate', label: 'Avg Engagement Rate', type: 'number' },
      {
        id: 'weekOverWeekDirection',
        label: 'Week-over-Week Direction',
        type: 'text',
      },
      {
        id: 'weekOverWeekChange',
        label: 'Week-over-Week Change %',
        type: 'number',
      },
    ],
    type: 'analyticsFeedback',
  },
  hookGenerator: {
    category: 'saas',
    defaultData: DEFAULT_HOOK_GENERATOR_DATA as Record<string, unknown>,
    description:
      'Generate viral hooks for TikTok slideshows using proven engagement formulas',
    icon: 'Zap',
    inputs: [
      { id: 'trendData', label: 'Trend Data', required: false, type: 'text' },
      { id: 'brand', label: 'Brand', required: false, type: 'brand' },
    ],
    label: 'Hook Generator',
    outputs: [
      { id: 'hookText', label: 'Hook Text', type: 'text' },
      { id: 'captionHook', label: 'Caption Hook', type: 'text' },
      { id: 'hashtags', label: 'Hashtags', type: 'text' },
      { id: 'slidePrompts', label: 'Slide Prompts', type: 'text' },
    ],
    type: 'hookGenerator',
  },
  trendHashtagInspiration: {
    category: 'input',
    defaultData: DEFAULT_TREND_HASHTAG_INSPIRATION_DATA as Record<
      string,
      unknown
    >,
    description: 'Generate content idea from trending hashtag',
    icon: 'Hash',
    inputs: [
      { id: 'hashtag', label: 'Hashtag', required: false, type: 'text' },
    ],
    label: 'Trend Hashtag Inspiration',
    outputs: [
      { id: 'prompt', label: 'Prompt', type: 'text' },
      { id: 'hashtags', label: 'Hashtags', type: 'text' },
      { id: 'contentType', label: 'Content Type', type: 'text' },
      { id: 'platform', label: 'Best Platform', type: 'text' },
    ],
    type: 'trendHashtagInspiration',
  },
  trendSoundInspiration: {
    category: 'input',
    defaultData: DEFAULT_TREND_SOUND_INSPIRATION_DATA as Record<
      string,
      unknown
    >,
    description: 'Get trending TikTok sound for content',
    icon: 'Music',
    inputs: [],
    label: 'Trend Sound Inspiration',
    outputs: [
      { id: 'soundId', label: 'Sound ID', type: 'text' },
      { id: 'soundName', label: 'Sound Name', type: 'text' },
      { id: 'soundUrl', label: 'Sound URL', type: 'text' },
      { id: 'duration', label: 'Duration (s)', type: 'number' },
      { id: 'usageCount', label: 'Usage Count', type: 'number' },
    ],
    type: 'trendSoundInspiration',
  },
  trendTrigger: {
    category: 'automation',
    defaultData: DEFAULT_TREND_TRIGGER_DATA as Record<string, unknown>,
    description: 'Start workflow when new trend matches criteria',
    icon: 'TrendingUp',
    inputs: [],
    label: 'Trend Trigger',
    outputs: [
      { id: 'trendId', label: 'Trend ID', type: 'text' },
      { id: 'topic', label: 'Topic', type: 'text' },
      { id: 'platform', label: 'Platform', type: 'text' },
      { id: 'viralScore', label: 'Viral Score', type: 'number' },
      { id: 'hashtags', label: 'Hashtags', type: 'text' },
      { id: 'videoUrl', label: 'Video URL', type: 'text' },
      { id: 'soundId', label: 'Sound ID', type: 'text' },
    ],
    type: 'trendTrigger',
  },
  trendVideoInspiration: {
    category: 'input',
    defaultData: DEFAULT_TREND_VIDEO_INSPIRATION_DATA as Record<
      string,
      unknown
    >,
    description: 'Extract generation prompt from trending video',
    icon: 'Sparkles',
    inputs: [
      { id: 'trendId', label: 'Trend ID', required: false, type: 'text' },
    ],
    label: 'Trend Video Inspiration',
    outputs: [
      { id: 'prompt', label: 'Prompt', type: 'text' },
      { id: 'hashtags', label: 'Hashtags', type: 'text' },
      { id: 'soundId', label: 'Sound ID', type: 'text' },
      { id: 'duration', label: 'Duration (s)', type: 'number' },
      { id: 'aspectRatio', label: 'Aspect Ratio', type: 'text' },
      { id: 'style', label: 'Style', type: 'text' },
    ],
    type: 'trendVideoInspiration',
  },
};

/**
 * Get all SaaS node types
 */
export function getSaaSNodeTypes(): SaaSNodeType[] {
  return Object.keys(SAAS_NODE_DEFINITIONS) as SaaSNodeType[];
}

/**
 * Check if a node type is a SaaS node
 */
export function isSaaSNode(type: string): type is SaaSNodeType {
  return type in SAAS_NODE_DEFINITIONS;
}
