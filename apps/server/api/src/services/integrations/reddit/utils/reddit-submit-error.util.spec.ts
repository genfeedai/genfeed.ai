import { PublishErrorKind } from '@genfeedai/contracts';
import { isPublishError } from '@genfeedai/contracts/interfaces';
import { throwIfRedditSubmitRejected } from './reddit-submit-error.util';

function rejection(code: string, headers: Record<string, string> = {}) {
  return {
    data: { json: { errors: [[code, 'message', 'field']] } },
    headers,
  };
}

function thrownBy(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('throwIfRedditSubmitRejected', () => {
  it('does nothing for an accepted submission', () => {
    expect(() =>
      throwIfRedditSubmitRejected({
        data: { json: { data: { id: 'abc' }, errors: [] } },
      }),
    ).not.toThrow();
  });

  it('reads RATELIMIT as a rate limit and takes the wait from the headers', () => {
    const error = thrownBy(() =>
      throwIfRedditSubmitRejected(
        rejection('RATELIMIT', { 'x-ratelimit-reset': '540' }),
      ),
    );

    expect(isPublishError(error) && error.kind).toBe(
      PublishErrorKind.RATE_LIMITED,
    );
    expect(isPublishError(error) && error.retryAfterMs).toBe(540_000);
  });

  it('reads USER_REQUIRED as a token that must be refreshed', () => {
    const error = thrownBy(() =>
      throwIfRedditSubmitRejected(rejection('USER_REQUIRED')),
    );

    expect(isPublishError(error) && error.kind).toBe(
      PublishErrorKind.TOKEN_MUST_REFRESH,
    );
  });

  it('reads any other refusal as a rejected post and keeps its code', () => {
    const error = thrownBy(() =>
      throwIfRedditSubmitRejected(rejection('SUBREDDIT_NOEXIST')),
    );

    expect(isPublishError(error) && error.kind).toBe(
      PublishErrorKind.CONTENT_REJECTED,
    );
    expect(isPublishError(error) && error.providerCode).toBe(
      'SUBREDDIT_NOEXIST',
    );
  });
});
