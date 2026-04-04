import type { JobPriority, JobType } from '@files/queues/queue.constants';
import type { VideoEaseCurve, VideoTransition } from '@genfeedai/enums';

export interface BaseJobData {
  id: string;
  type: JobType;
  ingredientId: string;
  userId: string; // Mongo user ID for database writes
  clerkUserId?: string; // Clerk user ID for socket routing
  organizationId: string;
  room?: string; // WebSocket room (e.g., 'user-<clerkUserId>')
  priority?: JobPriority;
  metadata: {
    websocketUrl: string;
    s3Bucket?: string;
    retryAttempts?: number;
  };
  createdAt: Date;
}

export interface VideoJobData extends BaseJobData {
  params: VideoProcessingParams;
}

export interface ImageJobData extends BaseJobData {
  params: ImageProcessingParams;
}

export interface FileJobData extends BaseJobData {
  params: FileProcessingParams;
  url?: string;
  filePath?: string;
  delay?: number;
}

export interface TaskProcessingConfig {
  s3Key?: string;
  captionContent?: string;
  captionLanguage?: string;
  orientation?: 'portrait' | 'landscape' | 'square';
  aspectRatio?: string;
  resolution?: string;
  width?: number;
  height?: number;
  duration?: number;
  count?: number;
}

export interface YoutubeJobData extends BaseJobData {
  postId: string;
  credential: {
    clientId: string;
    clientSecret: string;
    accessToken: string;
    refreshToken: string;
    redirectUri: string;
  };
  brandId?: string;
  title: string;
  description: string;
  tags?: string[];
  isUnlisted: boolean;
  status?: 'public' | 'private' | 'scheduled';
  scheduledDate?: string;
}

export interface VideoProcessingParams {
  // Common params
  inputPath?: string;
  outputPath?: string;
  s3Key?: string;

  // Resize params
  width?: number;
  height?: number;
  format?: 'portrait' | 'landscape' | 'square';

  // Merge params
  sourceIds?: string[];
  isCaptionsEnabled?: boolean;
  isResizeEnabled?: boolean;
  transition?: VideoTransition;
  transitionDuration?: number;
  transitionEaseCurve?: VideoEaseCurve;
  zoomEaseCurve?: VideoEaseCurve;
  zoomConfigs?: Array<{
    startZoom?: number;
    endZoom?: number;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
  }>;
  music?: string; // Music ingredient ID
  musicVolume?: number; // 0-1 (converted from 0-100)
  isMuteVideoAudio?: boolean;

  // Caption params
  captionContent?: string;
  captionLanguage?: string;

  // Text overlay params
  text?: string;
  position?: 'top' | 'bottom' | 'center';

  // Audio conversion params
  audioCodec?: string;
  audioBitrate?: string;
  audioFormat?: string;

  // Trim params
  startTime?: number;
  endTime?: number;

  // General params
  duration?: number;
  fps?: number;
  quality?: number;

  // Frame extraction params
  outputDir?: string;
  frameCount?: number;

  // Video metadata params
  videoPath?: string;
}

export interface ImageProcessingParams {
  inputPath?: string;
  outputPath?: string;
  s3Key?: string;

  // Image to video params
  images?: string[];
  duration?: number;
  fps?: number;

  // Ken Burns params
  zoomLevel?: number;
  panDirection?: 'left' | 'right' | 'up' | 'down';

  // Split screen params
  layout?: 'horizontal' | 'vertical' | 'grid';
  videos?: string[];

  // Resize params
  width?: number;
  height?: number;
  quality?: number;
}

export interface FileProcessingParams {
  // Download params
  url?: string;
  type?: string;
  index?: number;

  // Prepare files params
  frames?: unknown[];
  musicId?: string;

  // Cleanup params
  isDeleteOutputEnabled?: boolean;
  tempDirs?: string[];

  // S3 upload params
  filePath?: string;
  s3Key?: string;
  contentType?: string;

  // Watermark params
  watermarkText?: string;
  dimensions?: { width: number; height: number };

  // Clips params
  clipDuration?: number;
  clipCount?: number;

  // Captions overlay params
  captions?: Array<{
    duration: number;
    voiceText: string;
    overlayText?: string;
  }>;
}

export interface JobProgress {
  percent: number;
  frames?: number;
  fps?: number;
  time?: string;
  speed?: string;
  size?: string;
  // Step-based progress for merge operations
  step?:
    | 'downloading'
    | 'downloading-music'
    | 'merging'
    | 'resizing'
    | 'uploading';
  stepProgress?: number; // 0-100 progress within current step
  currentStepLabel?: string; // Human-readable label like "Downloading videos (2/3)"
  totalSteps?: number;
}

export interface JobResult {
  success: boolean;
  outputPath?: string;
  s3Key?: string;
  duration?: number;
  width?: number;
  height?: number;
  size?: number;
  error?: string;
  frameCount?: number;
  metadata?: unknown;
}
