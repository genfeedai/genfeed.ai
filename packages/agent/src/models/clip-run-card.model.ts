/** ClipRunStep — one step in the clip run lifecycle */
export interface ClipRunStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  outputUrl?: string;
  errorMessage?: string;
  retryable: boolean;
}

/** Mode toggles the user can change mid-run */
export interface ClipRunModes {
  enableMerge: boolean;
  enableReframe: boolean;
  confirmBeforePublish: boolean;
  platform: 'twitter' | 'instagram' | 'tiktok';
  duration: 15 | 30 | 60;
  aspectRatio: '16:9' | '9:16' | '1:1';
}

/** The full card state emitted by the agent tool */
export interface ClipRunCardState {
  clipProjectId: string;
  organizationId: string;
  brandId: string;
  currentStep: string;
  steps: ClipRunStep[];
  modes: ClipRunModes;
  finalOutputUrl?: string;
  status: 'idle' | 'running' | 'paused' | 'done' | 'failed';
  confirmationPending?: boolean;
  confirmationMessage?: string;
}
