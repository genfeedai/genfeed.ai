import { PublishErrorKind } from '@genfeedai/contracts';
import { PublishError } from '@genfeedai/contracts/interfaces';
import { HttpException, HttpStatus } from '@nestjs/common';
import {
  mapTikTokFailure,
  mapYoutubeFailure,
  nextPacificMidnight,
} from './provider-publish-error.mappers';
import { toPublishError } from './publish-error.util';

function httpFailure(
  status: number,
  data: unknown = {},
  headers: Record<string, string> = {},
): Error {
  return Object.assign(new Error(`status ${status}`), {
    response: { data, headers, status },
  });
}

function networkFailure(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe('toPublishError', () => {
  it.each([
    [400, PublishErrorKind.CONTENT_REJECTED],
    [404, PublishErrorKind.CONTENT_REJECTED],
    [401, PublishErrorKind.TOKEN_MUST_REFRESH],
    [403, PublishErrorKind.CHANNEL_DISCONNECTED],
    [408, PublishErrorKind.OUTCOME_UNKNOWN],
    [429, PublishErrorKind.RATE_LIMITED],
    [500, PublishErrorKind.OUTCOME_UNKNOWN],
    [503, PublishErrorKind.OUTCOME_UNKNOWN],
  ])('maps HTTP %i to %s', (status, kind) => {
    const error = toPublishError(httpFailure(status));

    expect(error?.kind).toBe(kind);
    expect(error?.httpStatus).toBe(status);
  });

  it.each(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EPIPE'])(
    'treats %s as an outcome that may be accepted',
    (code) => {
      expect(toPublishError(networkFailure(code))?.kind).toBe(
        PublishErrorKind.OUTCOME_UNKNOWN,
      );
    },
  );

  it.each(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'])(
    'treats %s as a request that never reached the provider',
    (code) => {
      expect(toPublishError(networkFailure(code))?.kind).toBe(
        PublishErrorKind.RETRY_LATER,
      );
    },
  );

  it('treats an aborted upload as an outcome that may be accepted', () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });

    expect(toPublishError(aborted)?.kind).toBe(
      PublishErrorKind.OUTCOME_UNKNOWN,
    );
  });

  it('leaves a plain error from our own code untyped', () => {
    expect(toPublishError(new Error('Failed to upload video'))).toBeNull();
  });

  it('returns a PublishError unchanged', () => {
    const typed = new PublishError(PublishErrorKind.CONTENT_REJECTED, 'no');

    expect(toPublishError(typed)).toBe(typed);
  });

  it('reads Retry-After seconds into retryAfterMs on a rate limit', () => {
    const error = toPublishError(httpFailure(429, {}, { 'Retry-After': '30' }));

    expect(error?.retryAfterMs).toBe(30_000);
  });

  it('reads an HTTP-date Retry-After relative to now', () => {
    const now = new Date('2026-11-16T10:00:00Z');
    const error = toPublishError(
      httpFailure(429, {}, { 'retry-after': 'Mon, 16 Nov 2026 10:01:00 GMT' }),
      () => null,
      now,
    );

    expect(error?.retryAfterMs).toBe(60_000);
  });

  it('reads the seconds in x-ratelimit-reset into retryAfterMs', () => {
    const error = toPublishError(
      httpFailure(429, {}, { 'X-Ratelimit-Reset': '120' }),
    );

    expect(error?.retryAfterMs).toBe(120_000);
  });

  it('gives no wait when the provider stated none', () => {
    const error = toPublishError(httpFailure(429));

    expect(error?.retryAfterMs).toBeUndefined();
    expect(error?.resetAt).toBeUndefined();
  });

  it('keeps the original failure as the cause', () => {
    const original = httpFailure(502);

    expect(toPublishError(original)?.cause).toBe(original);
  });
});

describe('nextPacificMidnight', () => {
  it('is 08:00 UTC the next day in winter', () => {
    expect(
      nextPacificMidnight(new Date('2026-11-16T20:00:00Z')).toISOString(),
    ).toBe('2026-11-17T08:00:00.000Z');
  });

  it('is 07:00 UTC the next day in summer', () => {
    expect(
      nextPacificMidnight(new Date('2026-07-01T12:00:00Z')).toISOString(),
    ).toBe('2026-07-02T07:00:00.000Z');
  });

  it('rolls to the following midnight just after midnight', () => {
    expect(
      nextPacificMidnight(new Date('2026-11-16T08:00:01Z')).toISOString(),
    ).toBe('2026-11-17T08:00:00.000Z');
  });

  it('uses the new offset when the clocks change that night', () => {
    // US clocks go back on 2026-11-01 at 02:00 PDT; midnight that day is PDT.
    expect(
      nextPacificMidnight(new Date('2026-10-31T20:00:00Z')).toISOString(),
    ).toBe('2026-11-01T07:00:00.000Z');
    expect(
      nextPacificMidnight(new Date('2026-11-01T20:00:00Z')).toISOString(),
    ).toBe('2026-11-02T08:00:00.000Z');
  });
});

describe('YouTube failures', () => {
  const googleError = (status: number, reason: string): Error =>
    httpFailure(status, { error: { errors: [{ reason }] } });

  it('waits for the Pacific midnight reset when the quota is spent', () => {
    const now = new Date('2026-11-16T20:00:00Z');
    const error = toPublishError(
      googleError(403, 'quotaExceeded'),
      mapYoutubeFailure,
      now,
    );

    expect(error?.kind).toBe(PublishErrorKind.RATE_LIMITED);
    expect(error?.providerCode).toBe('quotaExceeded');
  });

  it('carries the quota reset time on the error', () => {
    const failure = googleError(403, 'quotaExceeded');
    const verdict = mapYoutubeFailure(
      {
        cause: failure,
        headers: {},
        httpStatus: 403,
      },
      new Date('2026-11-16T20:00:00Z'),
    );

    expect(verdict?.resetAt?.toISOString()).toBe('2026-11-17T08:00:00.000Z');
  });

  it.each([
    ['uploadLimitExceeded', 400, PublishErrorKind.RATE_LIMITED],
    ['forbidden', 403, PublishErrorKind.CHANNEL_DISCONNECTED],
    ['insufficientPermissions', 403, PublishErrorKind.CHANNEL_DISCONNECTED],
    ['youtubeSignupRequired', 401, PublishErrorKind.CHANNEL_DISCONNECTED],
    ['forbiddenPrivacySetting', 403, PublishErrorKind.CONTENT_REJECTED],
    ['invalidTitle', 400, PublishErrorKind.CONTENT_REJECTED],
    ['mediaBodyRequired', 400, PublishErrorKind.CONTENT_REJECTED],
  ])('maps the %s reason (HTTP %i) to %s', (reason, status, kind) => {
    const error = toPublishError(
      googleError(status, reason),
      mapYoutubeFailure,
    );

    expect(error?.kind).toBe(kind);
    expect(error?.providerCode).toBe(reason);
  });

  it('reads the reason from the error list on the thrown error too', () => {
    const failure = Object.assign(new Error('Quota'), {
      errors: [{ reason: 'forbidden' }],
      response: { headers: {}, status: 403 },
    });

    expect(toPublishError(failure, mapYoutubeFailure)?.kind).toBe(
      PublishErrorKind.CHANNEL_DISCONNECTED,
    );
  });

  it('reads a revoked grant from the auth service as a disconnected channel', () => {
    const revoked = new HttpException(
      { title: 'YouTube Authentication Failed' },
      HttpStatus.UNAUTHORIZED,
    );

    expect(toPublishError(revoked, mapYoutubeFailure)?.kind).toBe(
      PublishErrorKind.CHANNEL_DISCONNECTED,
    );
  });

  it('treats an upstream 5xx during the upload as an unknown outcome', () => {
    expect(toPublishError(httpFailure(503), mapYoutubeFailure)?.kind).toBe(
      PublishErrorKind.OUTCOME_UNKNOWN,
    );
  });
});

describe('TikTok failures', () => {
  const tiktokError = (status: number, code: string): Error =>
    httpFailure(status, { error: { code } });

  it.each([
    ['access_token_invalid', 401, PublishErrorKind.TOKEN_MUST_REFRESH],
    ['scope_not_authorized', 401, PublishErrorKind.CHANNEL_DISCONNECTED],
    [
      'spam_risk_user_banned_from_posting',
      403,
      PublishErrorKind.CHANNEL_DISCONNECTED,
    ],
    ['rate_limit_exceeded', 429, PublishErrorKind.RATE_LIMITED],
    ['spam_risk_too_many_posts', 403, PublishErrorKind.RATE_LIMITED],
    ['reached_active_user_cap', 403, PublishErrorKind.RATE_LIMITED],
    [
      'unaudited_client_can_only_post_to_private_accounts',
      403,
      PublishErrorKind.CONTENT_REJECTED,
    ],
    ['url_ownership_unverified', 403, PublishErrorKind.CONTENT_REJECTED],
    ['privacy_level_option_mismatch', 403, PublishErrorKind.CONTENT_REJECTED],
    ['invalid_file_upload', 400, PublishErrorKind.CONTENT_REJECTED],
    ['internal_error', 500, PublishErrorKind.OUTCOME_UNKNOWN],
  ])('maps %s (HTTP %i) to %s', (code, status, kind) => {
    const error = toPublishError(tiktokError(status, code), mapTikTokFailure);

    expect(error?.kind).toBe(kind);
    expect(error?.providerCode).toBe(code);
  });

  it('lets the status decide when TikTok sends a code the docs do not list', () => {
    const error = toPublishError(
      tiktokError(403, 'some_new_code'),
      mapTikTokFailure,
    );

    expect(error?.kind).toBe(PublishErrorKind.CHANNEL_DISCONNECTED);
    expect(error?.providerCode).toBe('some_new_code');
  });

  it('reads Retry-After on a TikTok rate limit', () => {
    const error = toPublishError(
      httpFailure(
        429,
        { error: { code: 'rate_limit_exceeded' } },
        {
          'retry-after': '45',
        },
      ),
      mapTikTokFailure,
    );

    expect(error?.retryAfterMs).toBe(45_000);
  });
});
