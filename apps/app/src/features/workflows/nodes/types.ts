/**
 * Distribution & Automation Node Types
 * Extended node types for premium content distribution features
 */

import type {
  NotificationChannel,
  PublishStatus,
  ReviewGateStatus,
  WorkflowNodeStatus,
} from '@genfeedai/contracts';
import type { BaseNodeData } from '@genfeedai/contracts/types/nodes';

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
 * Publish Node - publishes to social platforms via Blotato/Buffer
 */
interface PublishNodeData extends BaseNodeData {
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

/**
 * Review Gate Node - pauses execution for human approval
 */
export interface ReviewGateNodeData extends BaseNodeData {
  // Input from connections
  inputMedia: string | null;
  inputType: 'image' | 'video' | 'audio' | 'text' | null;
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
interface ScheduleTriggerNodeData extends BaseNodeData {
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

type EffectsNodeType = 'colorGrade';

type DistributionNodeType = 'platformExport' | 'captionGen' | 'publish';

type AutomationNodeType = 'reviewGate' | 'scheduleTrigger' | 'webhookTrigger';

type RepurposingNodeType = 'clipSelector' | 'platformMultiplier';

type ExtendedNodeType =
  | EffectsNodeType
  | DistributionNodeType
  | AutomationNodeType
  | RepurposingNodeType;

type ExtendedNodeData =
  | ColorGradeNodeData
  | PlatformExportNodeData
  | CaptionGenNodeData
  | PublishNodeData
  | ReviewGateNodeData
  | ScheduleTriggerNodeData
  | WebhookTriggerNodeData
  | ClipSelectorNodeData
  | PlatformMultiplierNodeData;
