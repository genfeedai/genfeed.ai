import {
  DEFAULT_ANALYTICS_FEEDBACK_DATA,
  DEFAULT_BEAT_ANALYSIS_DATA,
  DEFAULT_BEAT_SYNC_EDITOR_DATA,
  DEFAULT_BRAND_ASSET_DATA,
  DEFAULT_BRAND_CONTEXT_DATA,
  DEFAULT_BRAND_DATA,
  DEFAULT_COMMENT_TRIGGER_DATA,
  DEFAULT_CONDITION_DATA,
  DEFAULT_DELAY_DATA,
  DEFAULT_ENGAGEMENT_TRIGGER_DATA,
  DEFAULT_FOLLOW_USER_DATA,
  DEFAULT_HOOK_GENERATOR_DATA,
  DEFAULT_IMAGE_TEXT_OVERLAY_DATA,
  DEFAULT_KEYWORD_TRIGGER_DATA,
  DEFAULT_LIKE_POST_DATA,
  DEFAULT_MUSIC_SOURCE_DATA,
  DEFAULT_PATTERN_CONTEXT_DATA,
  DEFAULT_PERSONA_CONTENT_PLAN_DATA,
  DEFAULT_PERSONA_PHOTO_SESSION_DATA,
  DEFAULT_PERSONA_VIDEO_CONTENT_DATA,
  DEFAULT_POST_REPLY_DATA,
  DEFAULT_PUBLISH_DATA,
  DEFAULT_SEND_DM_DATA,
  DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA,
  DEFAULT_SOUND_OVERLAY_DATA,
  DEFAULT_TREND_HASHTAG_INSPIRATION_DATA,
  DEFAULT_TREND_SOUND_INSPIRATION_DATA,
  DEFAULT_TREND_TRIGGER_DATA,
  DEFAULT_TREND_VIDEO_INSPIRATION_DATA,
  DEFAULT_VIDEO_INPUT_DATA,
  defaultRssInputData,
  defaultTweetInputData,
  defaultTweetRemixData,
} from '@workflow-saas/nodes';
import type {
  ExtendedNodeCategory,
  SaaSHandleDefinition,
} from '@workflow-saas/types';

/**
 * SaaS-specific node types
 *
 * Keep in sync with:
 *   - packages/workflow-saas/src/nodes/index.ts (barrel exports)
 *   - SAAS_NODE_DEFINITIONS below
 */
export type SaaSNodeType =
  // brand / context
  | 'brand'
  | 'brandAsset'
  | 'brandContext'
  | 'patternContext'
  // control flow
  | 'condition'
  | 'delay'
  // input / triggers
  | 'analyticsFeedback'
  | 'commentTrigger'
  | 'engagementTrigger'
  | 'followUser'
  | 'keywordTrigger'
  | 'likePost'
  | 'musicSource'
  | 'rssInput'
  | 'trendTrigger'
  | 'tweetInput'
  | 'videoInput'
  // processing
  | 'beatAnalysis'
  | 'beatSyncEditor'
  | 'imageTextOverlay'
  | 'slideshowImageBatch'
  | 'soundOverlay'
  | 'tweetRemix'
  // AI / generation
  | 'hookGenerator'
  | 'hookPerformanceTracker'
  | 'trendHashtagInspiration'
  | 'trendSoundInspiration'
  | 'trendVideoInspiration'
  // persona / content
  | 'personaContentPlan'
  | 'personaPhotoSession'
  | 'personaVideoContent'
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
  condition: {
    category: 'processing',
    defaultData: DEFAULT_CONDITION_DATA as Record<string, unknown>,
    description:
      'Branch workflow based on field conditions, comparisons, or expressions',
    icon: 'GitBranch',
    inputs: [{ id: 'value', label: 'Value', required: true, type: 'any' }],
    label: 'Condition',
    outputs: [
      { id: 'true', label: 'True', type: 'any' },
      { id: 'false', label: 'False', type: 'any' },
    ],
    type: 'condition',
  },

  delay: {
    category: 'processing',
    defaultData: DEFAULT_DELAY_DATA as Record<string, unknown>,
    description:
      'Pause workflow execution for a fixed duration, until a time, or optimal posting time',
    icon: 'Clock',
    inputs: [{ id: 'data', label: 'Data', required: false, type: 'any' }],
    label: 'Delay',
    outputs: [{ id: 'data', label: 'Data', type: 'any' }],
    type: 'delay',
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
  followUser: {
    category: 'automation',
    defaultData: DEFAULT_FOLLOW_USER_DATA as Record<string, unknown>,
    description: 'Follow a user account on a social platform',
    icon: 'UserPlus',
    inputs: [
      { id: 'brand', label: 'Brand', required: true, type: 'brand' },
      { id: 'userId', label: 'User ID', required: true, type: 'text' },
    ],
    label: 'Follow User',
    outputs: [{ id: 'success', label: 'Success', type: 'text' }],
    type: 'followUser',
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
  likePost: {
    category: 'automation',
    defaultData: DEFAULT_LIKE_POST_DATA as Record<string, unknown>,
    description: 'Like or favorite a post on a social platform',
    icon: 'Heart',
    inputs: [
      { id: 'brand', label: 'Brand', required: true, type: 'brand' },
      { id: 'postId', label: 'Post ID', required: true, type: 'text' },
    ],
    label: 'Like Post',
    outputs: [{ id: 'success', label: 'Success', type: 'text' }],
    type: 'likePost',
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
  patternContext: {
    category: 'saas',
    defaultData: DEFAULT_PATTERN_CONTEXT_DATA as Record<string, unknown>,
    description:
      'Retrieve proven creative patterns for your brand from performance data',
    icon: 'TrendingUp',
    inputs: [],
    label: 'Pattern Context',
    outputs: [{ id: 'patterns', label: 'Patterns', type: 'object' }],
    type: 'patternContext',
  },
  personaContentPlan: {
    category: 'saas',
    defaultData: DEFAULT_PERSONA_CONTENT_PLAN_DATA as Record<string, unknown>,
    description:
      'Generate an N-day content plan based on persona content strategy',
    icon: 'Calendar',
    inputs: [{ id: 'brand', label: 'Brand', required: true, type: 'brand' }],
    label: 'Content Plan',
    outputs: [{ id: 'plan', label: 'Content Plan', type: 'object' }],
    type: 'personaContentPlan',
  },
  personaPhotoSession: {
    category: 'saas',
    defaultData: DEFAULT_PERSONA_PHOTO_SESSION_DATA as Record<string, unknown>,
    description: 'Generate batch photos for an AI persona using their avatar',
    icon: 'Camera',
    inputs: [{ id: 'brand', label: 'Brand', required: true, type: 'brand' }],
    label: 'Persona Photo Session',
    outputs: [
      {
        id: 'images',
        label: 'Generated Photos',
        multiple: true,
        type: 'image',
      },
    ],
    type: 'personaPhotoSession',
  },
  personaVideoContent: {
    category: 'saas',
    defaultData: DEFAULT_PERSONA_VIDEO_CONTENT_DATA as Record<string, unknown>,
    description: 'Generate video content with AI persona avatar and voice',
    icon: 'Video',
    inputs: [
      { id: 'brand', label: 'Brand', required: true, type: 'brand' },
      { id: 'script', label: 'Script', type: 'text' },
    ],
    label: 'Persona Video',
    outputs: [{ id: 'video', label: 'Generated Video', type: 'video' }],
    type: 'personaVideoContent',
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
  beatAnalysis: {
    category: 'processing',
    defaultData: DEFAULT_BEAT_ANALYSIS_DATA as Record<string, unknown>,
    description: 'Detect tempo and beat timestamps from audio',
    icon: 'Activity',
    inputs: [
      { id: 'musicUrl', label: 'Music URL', required: true, type: 'audio' },
    ],
    label: 'Beat Analysis',
    outputs: [
      { id: 'tempo', label: 'Tempo (BPM)', type: 'number' },
      {
        id: 'beatTimestamps',
        label: 'Beat Timestamps',
        multiple: true,
        type: 'number',
      },
      { id: 'downbeats', label: 'Downbeats', multiple: true, type: 'number' },
      { id: 'beatCount', label: 'Beat Count', type: 'number' },
    ],
    type: 'beatAnalysis',
  },
  beatSyncEditor: {
    category: 'processing',
    defaultData: DEFAULT_BEAT_SYNC_EDITOR_DATA as Record<string, unknown>,
    description: 'Cut videos to match beat timestamps',
    icon: 'Scissors',
    inputs: [
      {
        id: 'videoFiles',
        label: 'Video Files',
        multiple: true,
        required: true,
        type: 'video',
      },
      {
        id: 'beatTimestamps',
        label: 'Beat Timestamps',
        multiple: true,
        required: true,
        type: 'number',
      },
      { id: 'musicUrl', label: 'Music URL', required: true, type: 'audio' },
    ],
    label: 'Beat Sync Editor',
    outputs: [
      { id: 'videoUrl', label: 'Output Video', type: 'video' },
      { id: 'totalClips', label: 'Total Clips', type: 'number' },
    ],
    type: 'beatSyncEditor',
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
  hookPerformanceTracker: {
    category: 'saas',
    defaultData: {},
    description:
      'Track hook performance to close the feedback loop on content that works',
    icon: 'TrendingUp',
    inputs: [
      { id: 'postId', label: 'Post ID', required: true, type: 'text' },
      { id: 'hookText', label: 'Hook Text', required: false, type: 'text' },
      {
        id: 'hookFormula',
        label: 'Hook Formula',
        required: false,
        type: 'text',
      },
    ],
    label: 'Hook Performance Tracker',
    outputs: [
      { id: 'performanceId', label: 'Performance ID', type: 'text' },
      { id: 'analysisSummary', label: 'Analysis Summary', type: 'text' },
    ],
    type: 'hookPerformanceTracker',
  },
  imageTextOverlay: {
    category: 'saas',
    defaultData: DEFAULT_IMAGE_TEXT_OVERLAY_DATA as Record<string, unknown>,
    description:
      'Burn text overlay onto static images for TikTok slideshow hooks',
    icon: 'Type',
    inputs: [
      { id: 'image', label: 'Image', required: true, type: 'image' },
      { id: 'text', label: 'Text', required: true, type: 'text' },
    ],
    label: 'Image Text Overlay',
    outputs: [{ id: 'image', label: 'Image with Text', type: 'image' }],
    type: 'imageTextOverlay',
  },
  rssInput: {
    category: 'input',
    defaultData: defaultRssInputData as Record<string, unknown>,
    description: 'Fetch and parse RSS feeds from URL or XML',
    icon: 'Rss',
    inputs: [],
    label: 'RSS Input',
    outputs: [
      { id: 'title', label: 'Item Title', type: 'text' },
      { id: 'description', label: 'Item Description', type: 'text' },
      { id: 'link', label: 'Item Link', type: 'text' },
    ],
    type: 'rssInput',
  },
  slideshowImageBatch: {
    category: 'saas',
    defaultData: DEFAULT_SLIDESHOW_IMAGE_BATCH_DATA as Record<string, unknown>,
    description:
      'Generate a batch of consistent images for TikTok slideshow posts',
    icon: 'Images',
    inputs: [
      {
        id: 'slidePrompts',
        label: 'Slide Prompts',
        required: false,
        type: 'text',
      },
      { id: 'basePrompt', label: 'Base Prompt', required: false, type: 'text' },
    ],
    label: 'Slideshow Image Batch',
    outputs: [
      { id: 'images', label: 'Slide Images', multiple: true, type: 'image' },
    ],
    type: 'slideshowImageBatch',
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
  tweetInput: {
    category: 'input',
    defaultData: defaultTweetInputData as Record<string, unknown>,
    description: 'Fetch tweet content from URL or paste text directly',
    icon: 'Twitter',
    inputs: [],
    label: 'Tweet Input',
    outputs: [{ id: 'text', label: 'Tweet Text', type: 'text' }],
    type: 'tweetInput',
  },
  tweetRemix: {
    category: 'processing',
    defaultData: defaultTweetRemixData as Record<string, unknown>,
    description: 'Generate tweet variations with different tones and lengths',
    icon: 'Sparkles',
    inputs: [
      { id: 'text', label: 'Input Tweet', required: true, type: 'text' },
    ],
    label: 'Tweet Remix',
    outputs: [{ id: 'text', label: 'Selected Tweet', type: 'text' }],
    type: 'tweetRemix',
  },
  videoInput: {
    category: 'input',
    defaultData: DEFAULT_VIDEO_INPUT_DATA as Record<string, unknown>,
    description: 'Accept multiple video URLs for beat-synced editing',
    icon: 'Video',
    inputs: [
      {
        id: 'videoUrls',
        label: 'Video URLs',
        multiple: true,
        required: true,
        type: 'text',
      },
    ],
    label: 'Video Input',
    outputs: [
      { id: 'videoFiles', label: 'Video Files', multiple: true, type: 'video' },
      { id: 'totalDuration', label: 'Total Duration (s)', type: 'number' },
      { id: 'videoCount', label: 'Video Count', type: 'number' },
    ],
    type: 'videoInput',
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
