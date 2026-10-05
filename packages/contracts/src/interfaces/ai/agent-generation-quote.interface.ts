import type { RouterPriority } from '../..';
import type { GenerationExecutionDimensions } from '../billing/generation-credit-calculation.interface';

/**
 * `POST /router/estimate-generation-credits` request (#4672 Manual-mode
 * review card, #4813 billing parity). `organizationId` is never sent — the
 * server derives it from the authenticated user.
 */
export interface AgentGenerationQuoteRequest {
  /** Aspect ratio the Agent request will execute with; drives dimensions. */
  aspectRatio?: string;
  category: 'image' | 'image-edit' | 'video';
  duration?: number;
  /** Video audio toggle; admission prices it as the `audio` selector. */
  isAudioEnabled?: boolean;
  /** Executed pixel height; pair with `width` to quote exact dimensions. */
  height?: number;
  modelKey?: string;
  outputs?: number;
  prioritize?: RouterPriority;
  /** Required only when the server must route (no `modelKey`). */
  prompt?: string;
  quality?: string;
  resolution?: string;
  /** Executed pixel width; pair with `height` to quote exact dimensions. */
  width?: number;
}

/** Server-side quote input: the request plus the authenticated organization. */
export interface AgentGenerationQuoteInput extends AgentGenerationQuoteRequest {
  organizationId: string;
  /**
   * Pixel size a server-side caller will execute with (e.g. batch idea
   * generation at 1080×1920). Quotes exactly that instead of the Agent
   * aspect-ratio table, so the quote matches the charge.
   */
  dimensions?: GenerationExecutionDimensions;
}

/** Why the server could not quote a generation. Codes only, never provider data. */
export enum AgentGenerationQuoteUnavailableReason {
  /** The quote failed unexpectedly; the failure is logged server-side. */
  ERROR = 'ERROR',
  /** No prompt or model was given, so nothing can be priced or routed. */
  INSUFFICIENT_INPUT = 'INSUFFICIENT_INPUT',
  /** A setting the model's price depends on is missing or unsupported. */
  MISSING_SETTING = 'MISSING_SETTING',
  /** The model is not enabled, active or supported for this organization. */
  MODEL_UNAVAILABLE = 'MODEL_UNAVAILABLE',
  /** The model exists but admission cannot resolve an exact tariff for it. */
  PRICING_UNRESOLVED = 'PRICING_UNRESOLVED',
}

export interface AgentGenerationQuote {
  /** `null` when unavailable; generation requires an available finite quote. */
  credits: number | null;
  isAvailable: boolean;
  /** Concrete validated model; unavailable quotes never disclose a key. */
  modelKey: string | null;
  /** Set whenever `isAvailable` is false. */
  unavailableReason?: AgentGenerationQuoteUnavailableReason;
}

export type AgentGenerationQuoteStatus = 'available' | 'error';

/** Client-held quote bound to the request fingerprint version it answered. */
export interface AgentGenerationQuoteState extends AgentGenerationQuote {
  status: AgentGenerationQuoteStatus;
  version: number;
}
