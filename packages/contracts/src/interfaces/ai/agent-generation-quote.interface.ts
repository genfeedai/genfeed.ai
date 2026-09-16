import type { RouterPriority } from '../..';

/**
 * `POST /router/estimate-generation-credits` request (#4672 Manual-mode
 * review card, #4813 billing parity). `organizationId` is never sent — the
 * server derives it from the authenticated user.
 */
export interface AgentGenerationQuoteRequest {
  /** Aspect ratio the Agent request will execute with; drives dimensions. */
  aspectRatio?: string;
  category: 'image' | 'video';
  duration?: number;
  modelKey?: string;
  outputs?: number;
  prioritize?: RouterPriority;
  prompt: string;
  quality?: string;
  resolution?: string;
}

/** Server-side quote input: the request plus the authenticated organization. */
export interface AgentGenerationQuoteInput extends AgentGenerationQuoteRequest {
  organizationId: string;
}

export interface AgentGenerationQuote {
  /** `null` when unavailable; generation requires an available finite quote. */
  credits: number | null;
  isAvailable: boolean;
  /** Concrete validated model; unavailable quotes never disclose a key. */
  modelKey: string | null;
}

export type AgentGenerationQuoteStatus = 'available' | 'error';

/** Client-held quote bound to the request fingerprint version it answered. */
export interface AgentGenerationQuoteState extends AgentGenerationQuote {
  status: AgentGenerationQuoteStatus;
  version: number;
}
