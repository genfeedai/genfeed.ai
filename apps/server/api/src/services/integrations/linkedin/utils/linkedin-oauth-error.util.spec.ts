import {
  classifyLinkedInOAuthError,
  getSafeLinkedInOAuthErrorLog,
  throwMappedLinkedInOAuthError,
} from '@api/services/integrations/linkedin/utils/linkedin-oauth-error.util';
import { HttpException, HttpStatus } from '@nestjs/common';

function expectMappedStatus(error: unknown, status: number): void {
  try {
    throwMappedLinkedInOAuthError(error, 'Failed to verify LinkedIn OAuth');
  } catch (mapped) {
    expect(mapped).toBeInstanceOf(HttpException);
    expect((mapped as HttpException).getStatus()).toBe(status);
    return;
  }

  expect.fail('expected mapped LinkedIn OAuth error to throw');
}

describe('LinkedIn OAuth error mapping', () => {
  it('maps the Sentry 6Z missing-client-id throw to 503, not 500', () => {
    // linkedin-api-client generateMemberAuthorizationUrl throws this when
    // LINKEDIN_CLIENT_ID is unset. Connect used to wrap it in a catch-all 500.
    const error = new Error('The client ID must be specified.');
    const classification = classifyLinkedInOAuthError(error);

    expect(classification).toEqual({
      detail:
        'The linkedin integration is missing its provider credentials on this server.',
      kind: 'config',
      status: HttpStatus.SERVICE_UNAVAILABLE,
      title: 'Integration not configured',
    });
    expectMappedStatus(error, HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('maps a missing redirect URI to 503', () => {
    expectMappedStatus(
      new Error('The OAuth 2.0 redirect URL must be specified.'),
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });

  it('maps invalid_client to 503 so app-credential faults stay a server problem', () => {
    expectMappedStatus(
      {
        response: {
          data: { error: 'invalid_client' },
          status: 401,
        },
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });

  it('maps expired or reused authorization codes to 400', () => {
    expectMappedStatus(
      {
        response: {
          data: {
            error: 'invalid_grant',
            error_description: 'Authorization code expired',
          },
          status: 400,
        },
      },
      HttpStatus.BAD_REQUEST,
    );
    expectMappedStatus(
      new Error('Invalid authorization code'),
      HttpStatus.BAD_REQUEST,
    );
  });

  it('preserves provider 4xx statuses instead of collapsing them to 500', () => {
    expectMappedStatus({ response: { status: 401 } }, HttpStatus.UNAUTHORIZED);
    expectMappedStatus({ response: { status: 403 } }, HttpStatus.FORBIDDEN);
    expectMappedStatus(
      { response: { status: 429 } },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  });

  it('maps provider 5xx and transport failures to 502', () => {
    expectMappedStatus(
      { metadata: { status: 503 }, name: 'IntegrationHttpError' },
      HttpStatus.BAD_GATEWAY,
    );
    expectMappedStatus({ code: 'ETIMEDOUT' }, HttpStatus.BAD_GATEWAY);
    expectMappedStatus(
      { request: { path: '/oauth/v2/accessToken' } },
      HttpStatus.BAD_GATEWAY,
    );
  });

  it('keeps genuine unknown faults as 500', () => {
    expectMappedStatus(new Error('DB error'), HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('rethrows an existing HttpException unchanged', () => {
    const original = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    try {
      throwMappedLinkedInOAuthError(
        original,
        'Failed to verify LinkedIn OAuth',
      );
      expect.fail('expected HttpException to be rethrown');
    } catch (error) {
      expect(error).toBe(original);
    }
  });

  it('logs only a safe classification, never codes or provider payloads', () => {
    const log = getSafeLinkedInOAuthErrorLog({
      response: {
        data: {
          error: 'invalid_grant',
          error_description: 'Authorization code expired',
        },
        status: 400,
      },
    });

    expect(log).toEqual({
      code: 'invalid_grant',
      kind: 'provider_client',
      status: 400,
    });
    expect(JSON.stringify(log)).not.toContain('Authorization code expired');
  });
});
