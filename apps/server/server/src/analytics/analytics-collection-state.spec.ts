import {
  classifyAnalyticsCollectionError,
  delayedAnalyticsCollectionFailure,
} from './analytics-collection-state';

describe('analytics collection failure classification', () => {
  it.each([
    [{ response: { status: 401 } }, 'analytics.authentication_failed', false],
    [{ status: 404 }, 'analytics.metrics_delayed', true],
    [{ statusCode: 429 }, 'analytics.rate_limited', true],
    [{ status: 422 }, 'analytics.collection_failed', false],
    [{ status: 503 }, 'analytics.provider_unavailable', true],
  ])('classifies sanitized provider failures', (error, code, isRetryable) => {
    expect(classifyAnalyticsCollectionError(error, 'Twitter')).toEqual(
      expect.objectContaining({ code, isRetryable }),
    );
  });

  it('represents delayed metrics as a retryable collection failure', () => {
    expect(delayedAnalyticsCollectionFailure('Twitter')).toEqual({
      code: 'analytics.metrics_delayed',
      isRetryable: true,
      message: 'Twitter has not made analytics available yet.',
    });
  });
});
