export interface AnalyticsCollectionTargetRef {
  brandId: string;
  id: string;
  organizationId: string;
  platform: string;
}

export interface AnalyticsCollectionFailure {
  code: string;
  isRetryable: boolean;
  message: string;
}

export interface AnalyticsCollectionAttemptRef
  extends AnalyticsCollectionTargetRef {
  attemptKey?: string;
}

/**
 * A target that carries its own failure, for callers whose posts fail
 * individually (a per-post fetch loop) rather than all for one shared reason.
 */
export interface AnalyticsCollectionFailedTarget
  extends AnalyticsCollectionAttemptRef {
  failure: AnalyticsCollectionFailure;
}

export interface ServerAnalyticsCollectionState {
  markFailed(
    target: AnalyticsCollectionAttemptRef,
    failure: AnalyticsCollectionFailure,
  ): Promise<void>;
  markFailedBatch(
    targets: AnalyticsCollectionAttemptRef[],
    failure: AnalyticsCollectionFailure,
  ): Promise<void>;
  markFailedTargets(targets: AnalyticsCollectionFailedTarget[]): Promise<void>;
  markReady(
    target: AnalyticsCollectionAttemptRef,
    collectedAt?: Date,
  ): Promise<void>;
  markReadyBatch(
    targets: AnalyticsCollectionAttemptRef[],
    collectedAt?: Date,
  ): Promise<void>;
}
