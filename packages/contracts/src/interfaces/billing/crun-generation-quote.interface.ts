import type { KnowledgeSelection } from '@genfeedai/contracts/interfaces/knowledge-base/knowledge-retrieval.interface';

export const CRUN_IMAGE_MODEL_KEYS = [
  'crun/google/nano-banana-pro',
  'crun/bytedance/seedream-4-5',
] as const;
export type CrunImageModelKey = (typeof CRUN_IMAGE_MODEL_KEYS)[number];
export const CRUN_VIDEO_MODEL_KEYS = [
  'crun/kling/v2-5-turbo-pro',
  'crun/google/veo3-1-fast-t2v',
] as const;
export type CrunVideoModelKey = (typeof CRUN_VIDEO_MODEL_KEYS)[number];

export const CRUN_QUOTE_REASON_CODES = [
  'CRUN_DISABLED',
  'CRUN_MODEL_UNAVAILABLE',
  'CRUN_CREDENTIALS_UNAVAILABLE',
  'CRUN_BILLING_UNSUPPORTED',
  'CRUN_CONTRACT_UNAVAILABLE',
  'PRICING_UNAVAILABLE',
  'CRUN_RATE_LIMITED',
  'CRUN_PROVIDER_UNAVAILABLE',
  'CRUN_ENHANCEMENT_REQUIRED',
] as const;
export type CrunQuoteReasonCode = (typeof CRUN_QUOTE_REASON_CODES)[number];
export const CRUN_QUOTE_ERROR_CODES = [
  ...CRUN_QUOTE_REASON_CODES,
  'CRUN_INVALID_INPUT',
  'CRUN_QUOTE_STALE',
  'CRUN_QUOTE_IN_PROGRESS',
] as const;
export type CrunQuoteErrorCode = (typeof CRUN_QUOTE_ERROR_CODES)[number];

export interface CrunImageQuoteControls {
  contractVersion: string;
  aspectRatio?: string;
  resolution?: '1K' | '2K' | '4K';
  outputFormat?: 'png' | 'jpg';
}

/** Canonical effective intent. Auth, acquisition rates and raw URLs stay server-side. */
export interface CrunImageQuoteRequest {
  model: string;
  text: string;
  brandId?: string;
  folderId?: string;
  promptId?: string;
  references?: string[];
  outputs?: number;
  crunControls: CrunImageQuoteControls;
  style?: string;
  mood?: string;
  camera?: string;
  lens?: string;
  scene?: string;
  lighting?: string;
  fontFamily?: string;
  blacklist?: string[];
  brandingMode?: 'off' | 'brand';
  isBrandingEnabled?: boolean;
  promptTemplate?: string;
  useTemplate?: boolean;
  harness?: boolean;
  requestedSkillSlugs?: string[];
  knowledge?: KnowledgeSelection;
}

export interface CrunVideoQuoteControls {
  contractVersion: string;
  duration?: 5 | 10 | 4 | 6 | 8;
  aspectRatio?: string;
  resolution?: '720p' | '1080p' | '4k';
  negativePrompt?: string;
  guidanceScale?: number;
  translatePrompt?: boolean;
}

export interface CrunVideoQuoteRequest
  extends Omit<CrunImageQuoteRequest, 'model' | 'references' | 'crunControls'> {
  model: CrunVideoModelKey;
  references?: string[];
  endFrame?: string;
  parentId?: string;
  crunControls: CrunVideoQuoteControls;
}

export type CrunVideoGenerationRequest = CrunVideoQuoteRequest & {
  crunQuoteId?: string;
};

export type CrunGenerationQuoteResponse =
  | {
      isAvailable: true;
      quoteId: string;
      expiresAt: string;
      modelKey: string;
      contractVersion: string;
      credits: number;
      billingMode: 'credits' | 'byok';
      reasonCode: null;
    }
  | {
      isAvailable: false;
      quoteId: null;
      expiresAt: null;
      modelKey: string;
      contractVersion: null;
      credits: null;
      billingMode: null;
      reasonCode: CrunQuoteReasonCode;
    };

export interface CrunGenerationQuoteDocument {
  data: {
    type: 'crun-generation-quote';
    /** Fresh response identity, never an authorization token. */
    id: string;
    attributes: CrunGenerationQuoteResponse;
  };
}
