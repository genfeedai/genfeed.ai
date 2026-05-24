import type { ClipProject } from '@genfeedai/prisma';

export type { ClipProject } from '@genfeedai/prisma';

export interface IHighlight {
  id: string;
  start_time: number;
  end_time: number;
  title: string;
  summary: string;
  virality_score: number;
  tags: string[];
  clip_type: string;
}

export const ClipProjectStatus = [
  'pending',
  'transcribing',
  'analyzing',
  'analyzed',
  'clipping',
  'generating',
  'completed',
  'failed',
] as const;

export type ClipProjectStatusType = (typeof ClipProjectStatus)[number];

export interface ClipProjectHighlight extends IHighlight {
  [key: string]: unknown;
}

export interface ClipProjectSettings {
  addCaptions?: boolean;
  aspectRatio?: string;
  captionStyle?: string;
  maxClips?: number;
  maxDuration?: number;
  minDuration?: number;
  [key: string]: unknown;
}

export interface ClipProjectDocument extends ClipProject {
  _id: string;
  brand?: string | null;
  error?: string;
  highlights?: ClipProjectHighlight[];
  language?: string;
  name?: string;
  organization?: string;
  progress?: number;
  settings?: ClipProjectSettings;
  sourceVideoS3Key?: string;
  sourceVideoUrl?: string;
  status?: ClipProjectStatusType | string;
  transcriptText?: string;
  user?: string;
  [key: string]: unknown;
}
