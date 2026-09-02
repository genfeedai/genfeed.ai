import { PostEntity } from '@api/collections/posts/entities/post.entity';
import {
  ActivityEntityModel,
  ActivityKey,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  createChannelTargetError,
  createFailedPublishResult,
  createPublishFailedActivity,
  createQuotaExceededActivity,
  getPublishErrorCode,
  getPublishErrorMessage,
  isRetryablePublishError,
} from '@workers/crons/posts/post-publish-error.util';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('post publish error policy', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [{ isRetryable: true }, true],
    [{ isRetryable: false, message: '429 rate limit' }, false],
  ])('prefers an explicit retryability override for %p', (error, expected) => {
    expect(isRetryablePublishError(error)).toBe(expected);
  });

  it.each([
    ['429 rate limit', true],
    [new Error('Provider timed out'), true],
    [{ code: 'ECONNRESET' }, true],
    [new Error('Provider rejected the payload'), false],
  ])('classifies retryability for %p', (error, expected) => {
    expect(isRetryablePublishError(error)).toBe(expected);
  });

  it.each([
    ['429 rate limit', 'rate_limited'],
    [{ code: 'ETIMEDOUT' }, 'timeout'],
    [new Error('Provider returned HTTP 503'), 'provider_unavailable'],
    [{ code: 'Authorization Failed' }, 'authorization_failed'],
    [new Error('Provider rejected the payload'), 'provider_error'],
  ])('normalizes %p to error code %s', (error, expected) => {
    expect(getPublishErrorCode(error)).toBe(expected);
  });

  it('normalizes thrown values to the existing publish error message', () => {
    expect(getPublishErrorMessage(new Error('provider failed'))).toBe(
      'provider failed',
    );
    expect(getPublishErrorMessage('string failure')).toBe('string failure');
    expect(getPublishErrorMessage(null)).toBe('Post failed');
    expect(getPublishErrorMessage(new Error(''))).toBe('');
    expect(getPublishErrorMessage({ status: 503 })).toBe('[object Object]');
  });

  it('creates the existing structured channel-target error shape', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-18T18:00:00.000Z'));

    expect(
      createChannelTargetError('rate_limited', 'Try again later', true),
    ).toEqual({
      code: 'rate_limited',
      failedAt: '2026-08-18T18:00:00.000Z',
      isRetryable: true,
      message: 'Try again later',
    });
  });

  it('creates the existing failed publish result shape', () => {
    expect(createFailedPublishResult('twitter', 'Provider failed')).toEqual({
      error: 'Provider failed',
      executionState: TargetExecutionState.FAILED,
      externalId: null,
      platform: 'twitter',
      success: false,
      url: '',
    });
  });

  it('creates the existing quota-exceeded activity shape', () => {
    const post = new PostEntity({
      brandId: 'brand-1',
      id: 'post-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(
      createQuotaExceededActivity(
        post,
        { allowed: false, currentCount: 12, dailyLimit: 10 },
        'twitter',
      ),
    ).toMatchObject({
      brandId: 'brand-1',
      entityId: 'post-1',
      entityModel: ActivityEntityModel.POST,
      key: ActivityKey.POST_FAILED,
      organizationId: 'org-1',
      userId: 'user-1',
      value: 'Quota exceeded: 12/10 posts for twitter',
    });
  });

  it('creates the existing terminal failure activity shape', () => {
    const post = new PostEntity({
      brandId: 'brand-1',
      id: 'post-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(createPublishFailedActivity(post, 'Provider failed')).toMatchObject({
      brandId: 'brand-1',
      entityId: 'post-1',
      entityModel: ActivityEntityModel.POST,
      key: ActivityKey.POST_FAILED,
      organizationId: 'org-1',
      userId: 'user-1',
      value: 'Provider failed',
    });
  });
});
