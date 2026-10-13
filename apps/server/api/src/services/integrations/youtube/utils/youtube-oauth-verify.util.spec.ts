import {
  assertYoutubeVerifyFailureLogKeys,
  asYoutubeVerifyException,
  buildYoutubeVerifyFailureLog,
  buildYoutubeVerifyRequestLog,
  classifyYoutubeVerifyFailure,
  readYoutubeVerifyCorrelationId,
  YoutubeChannelMissingError,
  YoutubeOAuthVerifyFailureReason,
} from '@api/services/integrations/youtube/utils/youtube-oauth-verify.util';
import { YoutubeOAuthVerifyErrorCode } from '@genfeedai/contracts';
import { HttpException, HttpStatus } from '@nestjs/common';

const SECRET_CODE = 'google-auth-code-secret';
const SECRET_STATE = 'opaque-oauth-state-secret';
const SECRET_ACCESS = 'yt_access_secret_value';
const SECRET_REFRESH = 'yt_refresh_secret_value';

function providerError(input: {
  message: string;
  reason: string;
  status: number;
}) {
  return {
    response: {
      data: {
        error: {
          code: input.status,
          errors: [{ message: input.message, reason: input.reason }],
          message: `${input.message} code=${SECRET_CODE} token=${SECRET_ACCESS}`,
        },
      },
      status: input.status,
    },
  };
}

describe('youtube oauth verify diagnostics', () => {
  it('keeps public details short enough for the production client to retain the code', () => {
    const failures = [
      classifyYoutubeVerifyFailure(
        new YoutubeChannelMissingError(),
        'channel_lookup',
      ),
      classifyYoutubeVerifyFailure(
        new Error('exchange failed'),
        'token_exchange',
      ),
      classifyYoutubeVerifyFailure(
        providerError({
          message: 'Permission denied',
          reason: 'insufficientPermissions',
          status: 403,
        }),
        'channel_lookup',
      ),
      classifyYoutubeVerifyFailure(new Error('API Error'), 'channel_lookup'),
      classifyYoutubeVerifyFailure(new Error('no pending'), 'state_validation'),
      classifyYoutubeVerifyFailure(new Error('unexpected'), 'post_connection'),
    ];

    for (const failure of failures) {
      expect(failure.detail.length).toBeLessThan(200);
      expect(failure.detail).not.toContain('\n');
      expect(failure.detail).not.toContain(SECRET_CODE);
    }
  });

  it('classifies a missing channel separately from a provider lookup failure', () => {
    expect(
      classifyYoutubeVerifyFailure(
        new Error('No channel found for the authenticated user'),
        'channel_lookup',
      ).code,
    ).toBe(YoutubeOAuthVerifyErrorCode.CHANNEL_MISSING);
    expect(
      classifyYoutubeVerifyFailure(
        providerError({
          message:
            'The user has a Google Account but does not have a YouTube channel',
          reason: 'youtubeSignupRequired',
          status: 401,
        }),
        'channel_lookup',
      ).code,
    ).toBe(YoutubeOAuthVerifyErrorCode.CHANNEL_MISSING);
    expect(
      classifyYoutubeVerifyFailure(new Error('API Error'), 'channel_lookup')
        .code,
    ).toBe(YoutubeOAuthVerifyErrorCode.PROVIDER_FAILURE);
    expect(
      classifyYoutubeVerifyFailure(
        providerError({
          message: 'backend unavailable',
          reason: 'backendError',
          status: 503,
        }),
        'channel_lookup',
      ).code,
    ).toBe(YoutubeOAuthVerifyErrorCode.PROVIDER_FAILURE);
  });

  it('keeps token exchange, permissions, and denial distinct', () => {
    expect(
      classifyYoutubeVerifyFailure(
        providerError({
          message: 'Bad Request',
          reason: 'invalid_grant',
          status: 400,
        }),
        'token_exchange',
      ),
    ).toMatchObject({
      code: YoutubeOAuthVerifyErrorCode.TOKEN_EXCHANGE_FAILED,
      reason: YoutubeOAuthVerifyFailureReason.TOKEN_EXCHANGE,
    });
    expect(
      classifyYoutubeVerifyFailure(
        providerError({
          message: 'Permission denied',
          reason: 'insufficientPermissions',
          status: 403,
        }),
        'channel_lookup',
      ),
    ).toMatchObject({
      code: YoutubeOAuthVerifyErrorCode.MISSING_SCOPES,
      reason: YoutubeOAuthVerifyFailureReason.PERMISSIONS,
    });

    const denied = asYoutubeVerifyException(
      new HttpException(
        {
          detail: 'Authorization was denied. Connect again to retry.',
          title: 'Authorization denied',
        },
        HttpStatus.BAD_REQUEST,
      ),
      'callback',
    );
    expect(denied.getResponse()).toEqual(
      expect.objectContaining({
        code: YoutubeOAuthVerifyErrorCode.ACCESS_DENIED,
      }),
    );
  });

  it('logs an allowlisted verification failure and drops oauth secrets', () => {
    const error = new Error(
      `invalid_grant code=${SECRET_CODE} state=${SECRET_STATE} access_token=${SECRET_ACCESS} refresh_token=${SECRET_REFRESH}`,
    );
    const safeError = asYoutubeVerifyException(error, 'token_exchange');
    const log = buildYoutubeVerifyFailureLog({
      correlationId: 'req-12345678',
      error,
      safeError,
      stage: 'token_exchange',
    });

    expect(assertYoutubeVerifyFailureLogKeys(log)).toBe(true);
    expect(log).toMatchObject({
      correlationId: 'req-12345678',
      platform: 'youtube',
      reason: YoutubeOAuthVerifyFailureReason.TOKEN_EXCHANGE,
      stage: 'token_exchange',
    });
    const serialized = JSON.stringify(log);
    expect(serialized).not.toContain(SECRET_CODE);
    expect(serialized).not.toContain(SECRET_STATE);
    expect(serialized).not.toContain(SECRET_ACCESS);
    expect(serialized).not.toContain(SECRET_REFRESH);
    expect(JSON.stringify(safeError.getResponse())).not.toContain(SECRET_CODE);
  });

  it('does not copy the authorization code or state into the request log', () => {
    const log = buildYoutubeVerifyRequestLog(
      {
        code: SECRET_CODE,
        error: `access_denied ${SECRET_REFRESH}`,
        state: SECRET_STATE,
      },
      'req-12345678',
    );

    expect(log).toEqual({
      correlationId: 'req-12345678',
      hasCode: true,
      hasProviderError: true,
      hasState: true,
      platform: 'youtube',
      stage: 'request_received',
    });
    expect(JSON.stringify(log)).not.toContain(SECRET_CODE);
    expect(JSON.stringify(log)).not.toContain(SECRET_STATE);
    expect(JSON.stringify(log)).not.toContain(SECRET_REFRESH);
  });

  it('logs a safe provider error code and ignores a secret-shaped correlation header', () => {
    const log = buildYoutubeVerifyRequestLog(
      { code: SECRET_CODE, error: 'access_denied', state: SECRET_STATE },
      readYoutubeVerifyCorrelationId({
        'x-request-id': SECRET_CODE,
      }),
    );

    expect(log.providerError).toBe('access_denied');
    expect(log.correlationId).not.toBe(SECRET_CODE);
    expect(log.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('reuses an incoming correlation id and records the provider reason', () => {
    const error = providerError({
      message: 'Permission denied',
      reason: 'insufficientPermissions',
      status: 403,
    });
    const safeError = asYoutubeVerifyException(error, 'channel_lookup');
    const log = buildYoutubeVerifyFailureLog({
      correlationId: readYoutubeVerifyCorrelationId({
        'x-correlation-id': 'corr-123456',
      }),
      error,
      safeError,
      stage: 'channel_lookup',
    });

    expect(log).toMatchObject({
      correlationId: 'corr-123456',
      providerReason: 'insufficientPermissions',
      providerStatus: 403,
      reason: YoutubeOAuthVerifyFailureReason.PERMISSIONS,
    });
    expect(JSON.stringify(log)).not.toContain(SECRET_ACCESS);
  });
});
