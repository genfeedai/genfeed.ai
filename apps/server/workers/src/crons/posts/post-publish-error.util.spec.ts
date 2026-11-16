import { PostEntity } from '@api/collections/posts/entities/post.entity';
import {
  ActivityEntityModel,
  ActivityKey,
  PublishErrorKind,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { PublishError } from '@genfeedai/contracts/interfaces';
import {
  createChannelTargetError,
  createFailedPublishResult,
  createPublishFailedActivity,
  createQuotaExceededActivity,
  getPublishErrorCode,
  getPublishErrorMessage,
  isAmbiguousPublishError,
  isRetryablePublishError,
  toPublishFailureCause,
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
    [{ code: 'ETIMEDOUT' }, true],
    [new Error('Provider returned HTTP 503'), true],
    [{ code: 'ECONNRESET' }, true],
    [new Error('socket hang up'), true],
    [{ code: 'EPIPE' }, true],
    [
      {
        code: 'transient_failure',
        message: 'Beehiiv is temporarily unavailable.',
      },
      true,
    ],
    [{ message: 'Provider unavailable', statusCode: 502 }, true],
    [{ message: 'Gateway', response: { status: 504 } }, true],
    [{ code: 'validation_failed', statusCode: 400 }, false],
    ['429 rate limit', false],
    [{ code: 'ECONNREFUSED' }, false],
    [{ code: 'ENOTFOUND' }, false],
    [new Error('Provider rejected the payload'), false],
  ])('treats %p as an unknown provider outcome: %s', (error, expected) => {
    expect(isAmbiguousPublishError(error)).toBe(expected);
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

  describe('a failure that carries a kind', () => {
    it.each([
      [PublishErrorKind.RATE_LIMITED, true, false, 'rate_limited'],
      [PublishErrorKind.RETRY_LATER, true, false, 'provider_unavailable'],
      [PublishErrorKind.OUTCOME_UNKNOWN, true, true, 'outcome_unknown'],
      [PublishErrorKind.TOKEN_MUST_REFRESH, false, false, 'token_must_refresh'],
      [PublishErrorKind.CONTENT_REJECTED, false, false, 'content_rejected'],
      [
        PublishErrorKind.CHANNEL_DISCONNECTED,
        false,
        false,
        'channel_disconnected',
      ],
    ])(
      '%s: retryable %s, outcome unknown %s, code %s',
      (kind, isRetryable, isAmbiguous, code) => {
        const error = new PublishError(kind, 'Provider said no');

        expect(isRetryablePublishError(error)).toBe(isRetryable);
        expect(isAmbiguousPublishError(error)).toBe(isAmbiguous);
        expect(getPublishErrorCode(error)).toBe(code);
      },
    );

    it('is not misread from fragments in the provider message', () => {
      const rejected = new PublishError(
        PublishErrorKind.CONTENT_REJECTED,
        'Caption is longer than 500 characters; the request timed out the validator',
        { httpStatus: 400 },
      );

      expect(isRetryablePublishError(rejected)).toBe(false);
      expect(isAmbiguousPublishError(rejected)).toBe(false);
      expect(getPublishErrorCode(rejected)).toBe('content_rejected');
    });

    it('classifies a returned failure from its kind, not its message', () => {
      const cause = toPublishFailureCause({
        error: 'Caption is longer than 500 characters',
        errorKind: PublishErrorKind.CONTENT_REJECTED,
        executionState: TargetExecutionState.FAILED,
        externalId: null,
        platform: 'twitter',
        success: false,
        url: '',
      });

      expect(isRetryablePublishError(cause)).toBe(false);
    });
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

  it('writes the failure email: the post, the channel and why', () => {
    const post = new PostEntity({
      brandId: 'brand-1',
      description: '<p>Shipped the   weekly batch</p>',
      id: 'post-1',
      organizationId: 'org-1',
      platform: 'twitter',
      userId: 'user-1',
    });

    expect(createPublishFailedActivity(post, 'Provider failed').alert).toEqual({
      payload: {
        event: 'post_failed',
        kind: 'alert_email',
        label: 'Shipped the weekly batch',
        summary: 'It was not published to twitter: Provider failed',
        version: 1,
      },
    });
  });

  it('shortens a long post and a long reason in the failure email', () => {
    const post = new PostEntity({
      description: 'x'.repeat(200),
      id: 'post-1',
      organizationId: 'org-1',
      platform: 'twitter',
      userId: 'user-1',
    });

    const payload = createPublishFailedActivity(post, 'y'.repeat(500)).alert
      ?.payload as { label: string; summary: string };

    expect(payload.label).toBe(`${'x'.repeat(79)}…`);
    expect(payload.summary).toBe(
      `It was not published to twitter: ${'y'.repeat(300)}`,
    );
  });
});
