import type {
  ContentPlanItemStatus,
  ContentPlanItemType,
} from '@genfeedai/contracts';
import type { ContentPlanItem as PrismaContentPlanItem } from '@genfeedai/prisma';

export type { ContentPlanItem as PrismaContentPlanItem } from '@genfeedai/prisma';

export interface ContentPlanPipelineStep {
  aspectRatio?: string;
  duration?: number;
  imageUrl?: string;
  model: string;
  prompt?: string;
  text?: string;
  type: string;
  voiceId?: string;
  [key: string]: unknown;
}

export interface ContentPlanItemData {
  confidence?: number;
  postId?: string | null;
  error?: string | null;
  pipelineSteps?: ContentPlanPipelineStep[];
  platforms?: string[];
  prompt?: string | null;
  scheduledAt?: Date | string | null;
  skillSlug?: string | null;
  status?: ContentPlanItemStatus;
  topic?: string | null;
  type?: ContentPlanItemType | string;
  [key: string]: unknown;
}

export interface ContentPlanItemDocument
  extends Omit<PrismaContentPlanItem, 'data' | 'scheduledAt' | 'status'>,
    ContentPlanItemData {
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export type ContentPlanItem = ContentPlanItemDocument;
