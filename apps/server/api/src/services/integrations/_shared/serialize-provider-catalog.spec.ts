import {
  describeProviderCatalogError,
  serializeProviderCatalog,
  throwProviderCatalogError,
} from '@api/services/integrations/_shared/serialize-provider-catalog';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { AxiosError } from 'axios';
import { z } from 'zod';

describe('serializeProviderCatalog', () => {
  it('returns a JSON:API envelope without id', () => {
    expect(
      serializeProviderCatalog({
        attributes: { count: 2, provider: 'heygen', voices: [] },
        type: 'voices',
      }),
    ).toEqual({
      data: {
        attributes: { count: 2, provider: 'heygen', voices: [] },
        type: 'voices',
      },
    });
  });

  it('returns a JSON:API envelope with id', () => {
    expect(
      serializeProviderCatalog({
        attributes: { provider: 'heygen', voices: [] },
        id: 'heygen',
        type: 'voice-provider',
      }),
    ).toEqual({
      data: {
        attributes: { provider: 'heygen', voices: [] },
        id: 'heygen',
        type: 'voice-provider',
      },
    });
  });
});

function axiosFailure(options: {
  code?: string;
  message?: string;
  status?: number;
}): AxiosError {
  return new AxiosError(
    options.message ?? 'Request failed',
    options.code,
    { headers: { 'X-Api-Key': 'sk-secret' } } as never,
    undefined,
    options.status === undefined
      ? undefined
      : ({
          config: {},
          data: { token: 'provider-payload-secret' },
          headers: {},
          status: options.status,
          statusText: '',
        } as never),
  );
}

function capture(error: unknown): HttpException {
  try {
    throwProviderCatalogError('Failed to fetch HeyGen voices', error);
  } catch (thrown) {
    return thrown as HttpException;
  }
  throw new Error('expected throwProviderCatalogError to throw');
}

describe('throwProviderCatalogError', () => {
  it.each([
    [401, HttpStatus.FAILED_DEPENDENCY, 'provider_config'],
    [403, HttpStatus.FAILED_DEPENDENCY, 'provider_config'],
    [400, HttpStatus.BAD_GATEWAY, 'provider_rejected'],
    [429, HttpStatus.SERVICE_UNAVAILABLE, 'provider_unavailable'],
    [503, HttpStatus.SERVICE_UNAVAILABLE, 'provider_unavailable'],
  ])('maps provider status %i', (providerStatus, status, code) => {
    const httpError = capture(axiosFailure({ status: providerStatus }));
    expect(httpError.getStatus()).toBe(status);
    expect(httpError.getResponse()).toMatchObject({
      code,
      title: 'Failed to fetch HeyGen voices',
    });
  });

  it('maps timeouts to a gateway timeout', () => {
    const httpError = capture(
      axiosFailure({ code: 'ECONNABORTED', message: 'timeout of 15000ms' }),
    );
    expect(httpError.getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
    expect(httpError.getResponse()).toMatchObject({ code: 'provider_timeout' });
  });

  it('maps a missing provider response to unavailable', () => {
    const httpError = capture(axiosFailure({ code: 'ECONNREFUSED' }));
    expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('maps unreadable provider payloads to a bad gateway', () => {
    const parsed = z.object({ id: z.string() }).safeParse({});
    const httpError = capture(parsed.error);
    expect(httpError.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    expect(httpError.getResponse()).toMatchObject({
      code: 'provider_invalid_response',
    });
  });

  it('keeps the status and safe message of our own client errors', () => {
    const httpError = capture(
      new BadRequestException('Connect HeyGen to load identities.'),
    );
    expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(httpError.getResponse()).toMatchObject({
      detail: 'Connect HeyGen to load identities.',
    });
  });

  it('never leaks provider messages, payloads or credentials', () => {
    const responses = [
      axiosFailure({ message: 'sk-secret rejected', status: 401 }),
      axiosFailure({ message: 'sk-secret timeout', code: 'ETIMEDOUT' }),
      new Error('sk-secret exploded'),
    ].map((error) => JSON.stringify(capture(error).getResponse()));
    for (const body of responses) {
      expect(body).not.toContain('sk-secret');
      expect(body).not.toContain('provider-payload-secret');
    }
  });

  it('answers unexpected faults with a generic 500', () => {
    const httpError = capture(new Error('boom'));
    expect(httpError.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(httpError.getResponse()).toEqual({
      code: 'provider_unexpected',
      detail:
        'An unexpected error occurred while loading the provider catalog.',
      title: 'Failed to fetch HeyGen voices',
    });
  });

  it('handles thrown values that are not errors', () => {
    expect(capture('string error').getStatus()).toBe(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });
});

describe('describeProviderCatalogError', () => {
  it('summarizes a failure without message, headers or payload', () => {
    const diagnostics = describeProviderCatalogError(
      axiosFailure({ message: 'sk-secret rejected', status: 401 }),
    );
    expect(diagnostics).toEqual({
      category: 'provider_config',
      errorCode: undefined,
      errorName: 'AxiosError',
      providerStatus: 401,
      status: HttpStatus.FAILED_DEPENDENCY,
    });
    expect(JSON.stringify(diagnostics)).not.toContain('sk-secret');
  });
});
