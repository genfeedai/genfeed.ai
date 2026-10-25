import type { AgentClipperRunIdentity } from '@genfeedai/contracts/interfaces';

/** ClipperRunStep — one step in the clip run lifecycle */
export interface ClipperRunStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  outputUrl?: string;
  errorMessage?: string;
  retryable: boolean;
}

/** Mode toggles the user can change mid-run */
export interface ClipperRunModes {
  enableMerge: boolean;
  enableReframe: boolean;
  confirmBeforePublish: boolean;
  platform: 'twitter' | 'instagram' | 'tiktok';
  duration: 15 | 30 | 60;
  aspectRatio: '16:9' | '9:16' | '1:1';
}

/** The full card state emitted by the agent tool */
export interface ClipperRunCardState {
  clipperProjectId: string;
  organizationId: string;
  brandId: string;
  currentStep: string;
  steps: ClipperRunStep[];
  modes: ClipperRunModes;
  identity?: AgentClipperRunIdentity;
  finalOutputUrl?: string;
  status: 'idle' | 'running' | 'paused' | 'done' | 'failed';
  confirmationPending?: boolean;
  confirmationMessage?: string;
}
