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

export interface ServerAnalyticsCollectionState {
  markFailed(
    target: AnalyticsCollectionAttemptRef,
    failure: AnalyticsCollectionFailure,
  ): Promise<void>;
  markReady(
    target: AnalyticsCollectionAttemptRef,
    collectedAt?: Date,
  ): Promise<void>;
}
