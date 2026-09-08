import type { KnowledgeSourcePurpose } from '@genfeedai/contracts';

export type CaptureMode = 'page' | 'link' | 'selection' | 'social';

export interface KnowledgeSnapshot {
  mode: CaptureMode;
  title: string;
  url: string;
  text: string;
}

export interface KnowledgeCaptureDraft extends KnowledgeSnapshot {
  brandId: string;
  purpose: KnowledgeSourcePurpose;
  spaceId?: string;
}

export interface KnowledgeCaptureReceipt {
  id: string;
  brandId: string;
  title: string;
  sourceId?: string;
  versionId?: string;
  spaceId?: string;
  state: 'pending' | 'queued' | 'processing' | 'ready' | 'failed';
  error?: string;
  createdAt: string;
  draft?: KnowledgeCaptureDraft;
}

export interface KnowledgeCaptureSpace {
  id: string;
  title: string;
  isInbox: boolean;
}

export interface KnowledgeCapturePageProps {
  initialContent?: string;
  initialUrl?: string;
  initialMode?: CaptureMode;
}
