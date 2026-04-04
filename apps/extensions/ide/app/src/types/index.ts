/**
 * Genfeed.ai VS Code Extension Types
 * Based on the API schemas from api.genfeed.ai
 */

export enum IngredientFormat {
  PORTRAIT = 'portrait',
  LANDSCAPE = 'landscape',
  SQUARE = 'square',
}

export enum IngredientStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  GENERATED = 'generated',
  FAILED = 'failed',
}

export interface ImagePreset {
  id: string;
  name: string;
  description: string;
  prompt: string;
  style?: string;
  mood?: string;
  lighting?: string;
  camera?: string;
  scene?: string;
  format: IngredientFormat;
  model?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ImageGenerationPayload {
  text: string;
  model?: string;
  format?: IngredientFormat;
  width?: number;
  height?: number;
  outputs?: number;
  style?: string;
  mood?: string;
  lighting?: string;
  camera?: string;
  scene?: string;
  promptTemplate?: string;
  useTemplate?: boolean;
  brandingMode?: 'off' | 'brand';
  isBrandingEnabled?: boolean;
  blacklist?: string[];
  tags?: string[];
  waitForCompletion?: boolean;
}

export interface GeneratedImage {
  id: string;
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  model: string;
  format: IngredientFormat;
  width: number;
  height: number;
  status: IngredientStatus;
  createdAt: string;
}

export interface GeneratedVideo {
  id: string;
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  model: string;
  format: IngredientFormat;
  width: number;
  height: number;
  duration?: number;
  status: IngredientStatus;
  createdAt: string;
}

export type MediaItem = (GeneratedImage | GeneratedVideo) & {
  mediaType: 'image' | 'video';
};

export type GalleryTab = 'all' | 'images' | 'videos';

export interface AuthState {
  isAuthenticated: boolean;
  method: 'oauth' | 'deviceFlow' | 'apiKey' | null;
  userId?: string;
  email?: string;
  organizationId?: string;
}

export interface GenfeedConfig {
  apiEndpoint: string;
  defaultModel: string;
  defaultFormat: IngredientFormat;
  outputDirectory: string;
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

export type RunActionType = 'generate' | 'post' | 'analytics' | 'composite';
export type RunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RunRecord {
  _id?: string;
  id?: string;
  actionType: RunActionType;
  status: RunStatus;
  progress: number;
  traceId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RunTimelineEvent {
  level: 'info' | 'warn' | 'error';
  message: string;
  stage: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface WorkspaceCampaignDefaults {
  defaultChannel?: string;
  defaultObjective?: string;
  defaultCampaignName?: string;
}

export interface CampaignAuthoringContext {
  actionType: RunActionType;
  campaignName: string;
  channel: string;
  objective?: string;
  actionInput: string;
}

export interface RunArtifactBundle {
  run: RunRecord;
  campaign?: CampaignAuthoringContext;
  timeline: RunTimelineEvent[];
}

// Draft types — used by explain-and-post and commit-to-post
export type DraftStatus = 'pending' | 'scheduled' | 'published' | 'failed';

export interface DraftRecord {
  id: string;
  content: string;
  channel: string;
  status: DraftStatus;
  sourceRunId?: string;
  sourceType?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DraftSavePayload {
  content: string;
  channel: string;
  sourceRunId?: string;
  sourceType?: string;
  /** Original commit message (commit-to-post flow). */
  commitMessage?: string;
}

export interface PromptTemplate {
  key: string;
  name: string;
  template: string;
  category?: string;
  channel?: string;
}

export type ModelKey =
  | 'flux-1.1-pro'
  | 'flux-2-pro'
  | 'imagen-3'
  | 'imagen-4'
  | 'ideogram-v3'
  | 'seedream-3.1';

export const MODEL_DISPLAY_NAMES: Record<ModelKey, string> = {
  'flux-1.1-pro': 'FLUX 1.1 Pro',
  'flux-2-pro': 'FLUX 2 Pro',
  'ideogram-v3': 'Ideogram V3',
  'imagen-3': 'Google Imagen 3',
  'imagen-4': 'Google Imagen 4',
  'seedream-3.1': 'ByteDance SeeDream 3.1',
};

export const FORMAT_DIMENSIONS: Record<
  IngredientFormat,
  { width: number; height: number }
> = {
  [IngredientFormat.LANDSCAPE]: { height: 1080, width: 1920 },
  [IngredientFormat.PORTRAIT]: { height: 1920, width: 1080 },
  [IngredientFormat.SQUARE]: { height: 1024, width: 1024 },
};
