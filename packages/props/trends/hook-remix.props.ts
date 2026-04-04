import type { ITrendVideo } from '@genfeedai/interfaces';

export interface HookRemixFormData {
  brandId: string;
  ctaIngredientId: string;
  hookDurationSeconds: number;
}

export interface HookRemixBatchFormData {
  brandId: string;
  ctaIngredientId: string;
  hookDurationSeconds: number;
  videoIds: string[];
}

export interface HookRemixJobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  resultIngredientId?: string;
  error?: string;
}

export interface HookRemixCreateResponse {
  jobId: string;
  status: string;
  message: string;
}

export interface HookRemixBatchResponse {
  jobs: HookRemixCreateResponse[];
  totalQueued: number;
}

export interface ModalHookRemixProps {
  video: ITrendVideo | null;
  isOpen?: boolean;
  openKey?: number | string;
  onSubmit?: (jobId: string) => void;
  onClose?: () => void;
}
