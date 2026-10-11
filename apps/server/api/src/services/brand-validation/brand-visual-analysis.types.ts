/** Who a paid analysis is attributed to; taken from the validated snapshot, never from a caller. */
export interface BrandVisualAnalysisScope {
  organizationId: string;
  brandId: string;
}

/** The model that produced an analysis, recorded in the proof. */
export interface BrandVisionModelIdentity {
  id: string;
  model: string;
  version: string;
}

export interface BrandOcrRequest {
  scope: BrandVisualAnalysisScope;
  /** One PNG per analyzed frame, in frame order. */
  frames: readonly Uint8Array[];
}

/**
 * `read`: the model answered, with exactly one text per requested frame.
 * `disabled`: the platform switch is off; nothing was called or paid.
 * `unavailable`: the analysis could not complete (no model, provider error, malformed answer).
 */
export type BrandOcrOutcome =
  | { status: 'read'; provider: BrandVisionModelIdentity; texts: string[] }
  | { status: 'disabled' }
  | { status: 'unavailable' };

/** A region a detector proposes, as fractions of the frame it was found in. */
export interface BrandDetectedRegion {
  score: number;
  box: { x: number; y: number; width: number; height: number };
}

export interface BrandDetectionRequest {
  scope: BrandVisualAnalysisScope;
  /** One PNG per analyzed frame, in frame order. */
  frames: readonly Uint8Array[];
  /** The open-vocabulary text to look for, for example `logo`. */
  query: string;
}

/**
 * `detected`: the model answered, with exactly one list of regions per requested
 * frame (possibly empty). `disabled` and `unavailable` mean what they mean for OCR.
 */
export type BrandDetectionOutcome =
  | {
      status: 'detected';
      provider: BrandVisionModelIdentity;
      frames: BrandDetectedRegion[][];
    }
  | { status: 'disabled' }
  | { status: 'unavailable' };

/** Provider-backed reading of branded visuals. Never decides a pass or fail itself. */
export interface BrandVisualAnalysis {
  extractText(request: BrandOcrRequest): Promise<BrandOcrOutcome>;
  detectRegions(request: BrandDetectionRequest): Promise<BrandDetectionOutcome>;
}

/** What a vision provider returns for one OCR request. It throws when it cannot answer. */
export interface BrandVisionProviderOcrResult {
  provider: BrandVisionModelIdentity;
  texts: string[];
}
export interface BrandVisionProviderDetectionResult {
  provider: BrandVisionModelIdentity;
  frames: BrandDetectedRegion[][];
}
export interface BrandVisionProvider {
  extractText(request: BrandOcrRequest): Promise<BrandVisionProviderOcrResult>;
  detectRegions(
    request: BrandDetectionRequest,
  ): Promise<BrandVisionProviderDetectionResult>;
}
