import {
  DEFAULT_BRAND_ASSET_DATA,
  DEFAULT_BRAND_CONTEXT_DATA,
  DEFAULT_BRAND_DATA,
  DEFAULT_CONDITION_DATA,
  DEFAULT_DELAY_DATA,
  DEFAULT_ENGAGEMENT_TRIGGER_DATA,
  DEFAULT_FOLLOW_USER_DATA,
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
  DEFAULT_SOUND_OVERLAY_DATA,
} from '@workflow-saas/nodes';
import type {
  ExtendedNodeCategory,
  SaaSHandleDefinition,
} from '@workflow-saas/types';

/**
 * SaaS-specific node types
 */
export type SaaSNodeType =
  | 'brandContext'
  | 'brandAsset'
  | 'brand'
  | 'condition'
  | 'delay'
  | 'engagementTrigger'
  | 'followUser'
  | 'keywordTrigger'
  | 'likePost'
  | 'musicSource'
  | 'patternContext'
  | 'personaContentPlan'
  | 'personaPhotoSession'
  | 'personaVideoContent'
  | 'postReply'
  | 'publish'
  | 'sendDm'
  | 'soundOverlay';

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
      'Reply to a social media post on Twitter, Instagram, Threads, or Facebook',
    icon: 'MessageSquare',
    inputs: [
      { id: 'brand', label: 'Brand', required: true, type: 'brand' },
      { id: 'postId', label: 'Post ID', required: true, type: 'text' },
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
    description: 'Send a direct message on Twitter or Instagram',
    icon: 'Send',
    inputs: [
      { id: 'brand', label: 'Brand', required: true, type: 'brand' },
      {
        id: 'recipientId',
        label: 'Recipient ID',
        required: true,
        type: 'text',
      },
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
