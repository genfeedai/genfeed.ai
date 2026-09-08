import type { AgentArtifactReference } from '@genfeedai/contracts/interfaces/ai/agent-artifact-reference.interface';

export interface AgentWorkObject {
  id: string;
  kind: 'table' | 'script' | 'brief';
  title: string;
  body?: string;
  columns?: Array<{ key: string; label: string }>;
  rows?: Record<string, string>[];
  rowCount: number;
  revision: number;
  viewedInSession: boolean;
  reviewStatus: 'pending' | 'reviewing' | 'passed' | 'failed' | 'skipped';
  reviewError?: string;
  reference: AgentArtifactReference;
  href: string;
}

export interface AgentSessionAsset {
  ingredientId: string;
  kind: 'video' | 'image' | 'audio';
  title: string;
  url: string;
  href: string;
  duration?: number;
  width?: number;
  height?: number;
}

export interface AgentWorkObjectCollection {
  workObjects: AgentWorkObject[];
  sessionAssets: AgentSessionAsset[];
}

export interface AgentWorkObjectActionPayload {
  action: 'view' | 'edit' | 'review' | 'skip' | 'cancel';
  revision: number;
  sessionId: string;
  body?: string;
  rows?: Record<string, string>[];
  brandId?: string | null;
  expectedContextVersion?: number;
}
