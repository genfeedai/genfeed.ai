/**
 * Distribution & Automation Node Types
 * Extended node types for premium content distribution features
 */

import type { BaseNodeData } from '@cloud/types/nodes';
import {
  NotificationChannel,
  PublishStatus,
  ReviewGateStatus,
  WorkflowNodeStatus,
} from '@genfeedai/enums';

// =============================================================================
// PLATFORM EXPORT TYPES
// =============================================================================

/**
 * Supported social platforms with their specs
 */
export type ExportPlatform =
  | 'tiktok'
  | 'youtube_shorts'
  | 'instagram_reels'
  | 'instagram_stories'
  | 'instagram_post'
  | 'twitter'
  | 'linkedin'
  | 'facebook_reels'
  | 'youtube_standard'
  | 'custom';

/**
 * Platform export specifications
 */
export interface PlatformSpec {
  platform: ExportPlatform;
  label: string;
  aspectRatio: string;
  width: number;
  height: number;
  maxDuration?: number; // seconds
  maxFileSize?: number; // MB
  recommendedBitrate?: number; // kbps
  codec: 'h264' | 'h265';
  audioCodec: 'aac' | 'mp3';
}

/**
 * Platform specifications database
 */
export const PLATFORM_SPECS: Record<ExportPlatform, PlatformSpec> = {
  custom: {
    aspectRatio: '16:9',
    audioCodec: 'aac',
    codec: 'h264',
    height: 1080,
    label: 'Custom',
    platform: 'custom',
    width: 1920,
  },
  facebook_reels: {
    aspectRatio: '9:16',
    audioCodec: 'aac',
    codec: 'h264',
    height: 1920,
    label: 'Facebook Reels',
    maxDuration: 90,
    maxFileSize: 1000,
    platform: 'facebook_reels',
    recommendedBitrate: 6000,
    width: 1080,
  },
  instagram_post: {
    aspectRatio: '1:1',
    audioCodec: 'aac',
    codec: 'h264',
    height: 1080,
    label: 'Instagram Post',
    maxDuration: 60,
    maxFileSize: 100,
    platform: 'instagram_post',
    recommendedBitrate: 5000,
    width: 1080,
  },
  instagram_reels: {
    aspectRatio: '9:16',
    audioCodec: 'aac',
    codec: 'h264',
    height: 1920,
    label: 'Instagram Reels',
    maxDuration: 90,
    maxFileSize: 650,
    platform: 'instagram_reels',
    recommendedBitrate: 6000,
    width: 1080,
  },
  instagram_stories: {
    aspectRatio: '9:16',
    audioCodec: 'aac',
    codec: 'h264',
    height: 1920,
    label: 'Instagram Stories',
    maxDuration: 15,
    maxFileSize: 30,
    platform: 'instagram_stories',
    recommendedBitrate: 4000,
    width: 1080,
  },
  linkedin: {
    aspectRatio: '1:1',
    audioCodec: 'aac',
    codec: 'h264',
    height: 1080,
    label: 'LinkedIn',
    maxDuration: 600,
    maxFileSize: 200,
    platform: 'linkedin',
    recommendedBitrate: 5000,
    width: 1080,
  },
  tiktok: {
    aspectRatio: '9:16',
    audioCodec: 'aac',
    codec: 'h264',
    height: 1920,
    label: 'TikTok',
    maxDuration: 180,
    maxFileSize: 287,
    platform: 'tiktok',
    recommendedBitrate: 6000,
    width: 1080,
  },
  twitter: {
    aspectRatio: '16:9',
    audioCodec: 'aac',
    codec: 'h264',
    height: 1080,
    label: 'X (Twitter)',
    maxDuration: 140,
    maxFileSize: 512,
    platform: 'twitter',
    recommendedBitrate: 6000,
    width: 1920,
  },
  youtube_shorts: {
    aspectRatio: '9:16',
    audioCodec: 'aac',
    codec: 'h264',
    height: 1920,
    label: 'YouTube Shorts',
    maxDuration: 60,
    maxFileSize: 500,
    platform: 'youtube_shorts',
    recommendedBitrate: 8000,
    width: 1080,
  },
  youtube_standard: {
    aspectRatio: '16:9',
    audioCodec: 'aac',
    codec: 'h264',
    height: 1080,
    label: 'YouTube',
    maxDuration: 43200, // 12 hours
    maxFileSize: 128000,
    platform: 'youtube_standard',
    recommendedBitrate: 12000,
    width: 1920,
  },
};

// =============================================================================
// EFFECTS NODE DATA
// =============================================================================

/**
 * Color grade mode — preset uses FFmpeg filters, ai-style uses Replicate
 */
export type ColorGradeMode = 'preset' | 'custom' | 'ai-style';

export type ColorGradePreset =
  | 'instagram-warm'
  | 'instagram-cool'
  | 'instagram-moody'
  | 'instagram-bright'
  | 'custom';

/**
 * Color Grade Node — applies Instagram-style color grading to images
 */
export interface ColorGradeNodeData extends BaseNodeData {
  // Input from connection
  inputImage: string | null;

  // Config
  mode: ColorGradeMode;
  preset: ColorGradePreset;
  warmth: number;
  contrast: number;
  saturation: number;
  vignette: number;
  grain: number;
  sharpness: number;
  styleReferenceImage: string | null;

  // Output
  outputImage: string | null;

  // Job state
  jobId: string | null;
}

// =============================================================================
// DISTRIBUTION NODE DATA
// =============================================================================

/**
 * Platform Export Node - exports media with platform-specific encoding
 */
export interface PlatformExportNodeData extends BaseNodeData {
  // Input from connection
  inputMedia: string | null;
  inputType: 'image' | 'video' | null;

  // Config
  platform: ExportPlatform;
  customWidth?: number;
  customHeight?: number;

  // Output
  outputMedia: string | null;
  exportedSpec: PlatformSpec | null;

  // Job state
  jobId: string | null;
}

/**
 * Caption Generator Node - generates platform-optimized captions
 */
export interface CaptionGenNodeData extends BaseNodeData {
  // Input from connections
  inputContext: string | null; // Brand voice, topic, etc.
  inputMedia: string | null; // Optional - to describe media

  // Config
  platform: ExportPlatform;
  tone:
    | 'professional'
    | 'casual'
    | 'witty'
    | 'inspirational'
    | 'urgent'
    | 'storytelling';
  includeHashtags: boolean;
  hashtagCount: number;
  includeEmojis: boolean;
  includeCTA: boolean;
  ctaType: 'link_bio' | 'follow' | 'comment' | 'share' | 'save' | 'custom';
  customCTA?: string;

  // Constraints per platform
  maxLength: number; // Auto-set based on platform

  // Output
  outputCaption: string | null;
  outputHashtags: string[];

  // Job state
  jobId: string | null;
}

/**
 * Platform caption constraints
 */
export const PLATFORM_CAPTION_LIMITS: Record<ExportPlatform, number> = {
  custom: 5000,
  facebook_reels: 2200,
  instagram_post: 2200,
  instagram_reels: 2200,
  instagram_stories: 0, // Typically no caption
  linkedin: 3000,
  tiktok: 2200,
  twitter: 280,
  youtube_shorts: 100,
  youtube_standard: 5000,
};

/**
 * Publish Node - publishes to social platforms via Blotato/Buffer
 */
export interface PublishNodeData extends BaseNodeData {
  // Inputs from connections
  inputMedia: string | null;
  inputCaption: string | null;

  // Config
  platforms: Record<ExportPlatform, boolean>;
  scheduleType: 'immediate' | 'scheduled' | 'optimal';
  scheduledTime?: string; // ISO string
  timezone: string;

  // Integration config
  integrationProvider: 'blotato' | 'buffer' | 'native';

  // Output
  publishedPosts: Array<{
    platform: ExportPlatform;
    postId: string;
    postUrl?: string;
    status:
      | 'queued'
      | PublishStatus.SCHEDULED
      | PublishStatus.PUBLISHED
      | PublishStatus.FAILED;
  }>;

  // Job state
  jobId: string | null;
}

// =============================================================================
// AUTOMATION NODE DATA
// =============================================================================

/**
 * Review Gate Node - pauses execution for human approval
 */
export interface ReviewGateNodeData extends BaseNodeData {
  // Input from connections
  inputMedia: string | null;
  inputType: 'image' | 'video' | 'text' | null;
  inputCaption: string | null;

  // Config
  notifyChannels: NotificationChannel[];
  notifyEmail?: string;
  webhookUrl?: string;
  slackChannel?: string;
  timeoutHours: number; // Auto-reject after timeout
  autoApproveIfNoResponse: boolean;

  // State
  approvalStatus: ReviewGateStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;

  // Output (passes through input if approved)
  outputMedia: string | null;
  outputCaption: string | null;

  // Job state
  approvalId: string | null;
}

/**
 * Schedule Trigger Node - triggers workflow on schedule
 */
export interface ScheduleTriggerNodeData extends BaseNodeData {
  // Config
  scheduleType: 'cron' | 'interval' | 'time';
  cronExpression?: string; // "0 9 * * 1-5" = 9am weekdays
  intervalMinutes?: number;
  specificTime?: string; // "09:00"
  specificDays?: number[]; // [1,2,3,4,5] = Mon-Fri
  timezone: string;
  enabled: boolean;

  // State
  nextRunAt: string | null;
  lastRunAt: string | null;
  runCount: number;

  // Output - provides trigger metadata
  outputTriggerTime: string | null;
  outputRunNumber: number;
}

/**
 * Webhook Trigger Node - triggers workflow via webhook URL
 */
export interface WebhookTriggerNodeData extends BaseNodeData {
  // Config (auto-generated)
  webhookId: string | null;
  webhookUrl: string | null;
  webhookSecret: string | null;

  // Auth config
  authType: 'none' | 'secret' | 'bearer';

  // Input validation
  expectedPayloadSchema?: Record<string, unknown>;

  // State
  lastTriggeredAt: string | null;
  triggerCount: number;

  // Output - passes webhook payload
  outputPayload: Record<string, unknown> | null;
}

// =============================================================================
// REPURPOSING NODE DATA
// =============================================================================

/**
 * Clip Selector Node - AI-powered selection of best clips from long video
 */
export interface ClipSelectorNodeData extends BaseNodeData {
  // Inputs from connections
  inputVideo: string | null;
  inputTranscript: string | null;

  // Config
  clipCount: number; // How many clips to select
  clipDuration: { min: number; max: number }; // seconds
  selectionCriteria:
    | 'engagement_potential'
    | 'key_moments'
    | 'emotional_peaks'
    | 'educational_value';
  includeIntro: boolean;
  includeOutro: boolean;

  // Output
  outputClips: Array<{
    startTime: number;
    endTime: number;
    score: number;
    reason: string;
    suggestedCaption?: string;
  }>;

  // Job state
  jobId: string | null;
}

/**
 * Platform Multiplier Node - creates multiple platform-specific versions
 */
export interface PlatformMultiplierNodeData extends BaseNodeData {
  // Input from connections
  inputMedia: string | null;
  inputType: 'image' | 'video' | null;

  // Config
  targetPlatforms: ExportPlatform[];
  generateCaptions: boolean;
  captionTone?: CaptionGenNodeData['tone'];

  // Output
  outputs: Array<{
    platform: ExportPlatform;
    media: string | null;
    caption: string | null;
    status: WorkflowNodeStatus;
    error?: string;
  }>;

  // Job state
  jobId: string | null;
}

// =============================================================================
// NODE DEFINITIONS
// =============================================================================

export type EffectsNodeType = 'colorGrade';

export type DistributionNodeType = 'platformExport' | 'captionGen' | 'publish';

export type AutomationNodeType =
  | 'reviewGate'
  | 'scheduleTrigger'
  | 'webhookTrigger';

export type RepurposingNodeType = 'clipSelector' | 'platformMultiplier';

export type ExtendedNodeType =
  | EffectsNodeType
  | DistributionNodeType
  | AutomationNodeType
  | RepurposingNodeType;

export type ExtendedNodeData =
  | ColorGradeNodeData
  | PlatformExportNodeData
  | CaptionGenNodeData
  | PublishNodeData
  | ReviewGateNodeData
  | ScheduleTriggerNodeData
  | WebhookTriggerNodeData
  | ClipSelectorNodeData
  | PlatformMultiplierNodeData;
