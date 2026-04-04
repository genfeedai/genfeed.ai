// =============================================================================
// INPUT NODE DATA
// =============================================================================

import type { BaseNodeData } from './base';

export interface ImageInputNodeData extends BaseNodeData {
  image: string | null;
  filename: string | null;
  dimensions: { width: number; height: number } | null;
  source: 'upload' | 'url';
  url?: string;
}

export interface PromptNodeData extends BaseNodeData {
  prompt: string;
  variables: Record<string, string>;
}

export interface AudioInputNodeData extends BaseNodeData {
  audio: string | null;
  filename: string | null;
  duration: number | null;
  source: 'upload' | 'url';
  url?: string;
}

export interface VideoInputNodeData extends BaseNodeData {
  video: string | null;
  filename: string | null;
  duration: number | null;
  dimensions: { width: number; height: number } | null;
  source: 'upload' | 'url';
  url?: string;
}

export interface AvailableVariable {
  name: string;
  value: string;
  nodeId: string;
}

export interface PromptConstructorNodeData extends BaseNodeData {
  template: string;
  outputText: string | null;
  unresolvedVars: string[];
}
