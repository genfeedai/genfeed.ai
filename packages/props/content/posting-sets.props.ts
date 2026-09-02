import type {
  CreatePostingSetInput,
  IPostingSet,
  IPostingSignature,
} from '@genfeedai/contracts/interfaces';

export interface ExpandedPostingSetTarget {
  attachments?: Array<{
    body: string;
    kind: string;
    order?: number;
    platform?: string;
  }>;
  caption?: string;
  credentialId: string;
  order?: number;
  platform: string;
  scheduledDate?: string;
  settings?: Record<string, unknown>;
  timezone?: string;
  visibility?: string;
}

export interface UsePostingSetsOptions {
  autoLoad?: boolean;
}

export interface UsePostingSetsResult {
  createSet: (input: CreatePostingSetInput) => Promise<IPostingSet>;
  expandSet: (
    id: string,
    data?: {
      scheduledDate?: string;
      timezone?: string;
    },
  ) => Promise<ExpandedPostingSetTarget[]>;
  expandError: string | null;
  isExpanding: boolean;
  isLoading: boolean;
  isSaving: boolean;
  saveError: string | null;
  sets: IPostingSet[];
}

export interface UsePostingSignaturesResult {
  isLoading: boolean;
  signatures: IPostingSignature[];
}
