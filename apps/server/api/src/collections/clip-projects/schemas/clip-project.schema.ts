export type { ClipProject as ClipProjectDocument } from '@genfeedai/prisma';

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
