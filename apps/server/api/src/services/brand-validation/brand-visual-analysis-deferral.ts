import type {
  BrandDetectionOutcome,
  BrandDetectionRequest,
  BrandOcrOutcome,
  BrandOcrRequest,
  BrandVisualAnalysis,
} from '@api/services/brand-validation/brand-visual-analysis.types';

/** The part of the analysis service a deferral needs: the platform switch. */
export interface BrandVisualAnalysisGate {
  isEnabled(): Promise<boolean>;
}

/**
 * A stand-in for the analysis in a request path: it reads the platform switch and
 * answers `pending` instead of calling the provider, so the validator leaves the
 * readable checks `unknown` (`visual_analysis_pending`) and `isRequested` tells the
 * caller a background job must finish them. A switch that cannot be read is
 * `unavailable`. Nothing is called or paid here.
 */
export class BrandDeferredVisualAnalysis implements BrandVisualAnalysis {
  private requested = false;

  constructor(private readonly gate: BrandVisualAnalysisGate) {}

  /** True once a reading was wanted and deferred. */
  get isRequested(): boolean {
    return this.requested;
  }

  extractText(_request: BrandOcrRequest): Promise<BrandOcrOutcome> {
    return this.defer();
  }

  detectRegions(
    _request: BrandDetectionRequest,
  ): Promise<BrandDetectionOutcome> {
    return this.defer();
  }

  private async defer(): Promise<
    { status: 'pending' } | { status: 'disabled' } | { status: 'unavailable' }
  > {
    try {
      if (!(await this.gate.isEnabled())) return { status: 'disabled' };
    } catch {
      return { status: 'unavailable' };
    }
    this.requested = true;
    return { status: 'pending' };
  }
}
