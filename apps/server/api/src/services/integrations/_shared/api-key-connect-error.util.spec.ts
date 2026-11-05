import { WebhookUrlUnresolvableException } from '@api/shared/utils/webhook-validator/webhook-validator.util';
import { ApiKeyConnectErrorCode } from '@genfeedai/contracts';
import { BadRequestException, HttpStatus } from '@nestjs/common';
import { AxiosError, AxiosHeaders } from 'axios';
import {
  classifyApiKeyConnectError,
  createApiKeyConnectException,
} from './api-key-connect-error.util';

// The unit setup stubs axios; these cases need its real error class.
vi.mock('axios', async (original) => original());

function providerAnswered(status: number): AxiosError<unknown> {
  return new AxiosError(
    `Request failed with status code ${status}`,
    undefined,
    undefined,
    undefined,
    {
      config: { headers: new AxiosHeaders() },
      data: {},
      headers: {},
      status,
      statusText: 'Refused',
    },
  );
}

describe('classifyApiKeyConnectError', () => {
  it.each([
    [
      'a host that does not resolve',
      new WebhookUrlUnresolvableException(),
      ApiKeyConnectErrorCode.SITE_UNREACHABLE,
    ],
    [
      'a private address the safe agent refuses',
      new BadRequestException('private'),
      ApiKeyConnectErrorCode.INVALID_URL,
    ],
    [
      'a refused connection',
      new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED'),
      ApiKeyConnectErrorCode.SITE_UNREACHABLE,
    ],
    [
      'a timeout',
      new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED'),
      ApiKeyConnectErrorCode.SITE_UNREACHABLE,
    ],
    [
      '401 from the provider',
      providerAnswered(401),
      ApiKeyConnectErrorCode.KEY_REJECTED,
    ],
    [
      '403 from the provider',
      providerAnswered(403),
      ApiKeyConnectErrorCode.KEY_REJECTED,
    ],
    [
      'a 301 redirect',
      providerAnswered(301),
      ApiKeyConnectErrorCode.SITE_REDIRECTED,
    ],
    ['a 404', providerAnswered(404), ApiKeyConnectErrorCode.API_NOT_FOUND],
    [
      'a 500 from the provider',
      providerAnswered(500),
      ApiKeyConnectErrorCode.UNKNOWN,
    ],
    ['a plain error', new Error('boom'), ApiKeyConnectErrorCode.UNKNOWN],
  ])('classifies %s', (_case, error, expected) => {
    expect(classifyApiKeyConnectError(error)).toBe(expected);
  });
});

describe('createApiKeyConnectException', () => {
  it('answers a fixable reason with 400 and its code', () => {
    const exception = createApiKeyConnectException(
      ApiKeyConnectErrorCode.KEY_REJECTED,
    );

    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.getResponse()).toEqual({
      code: 'API_KEY_CONNECT_KEY_REJECTED',
      detail: 'The provider rejected the key.',
      title: 'Connect failed',
    });
  });

  it('answers an unclassified failure with 500', () => {
    expect(
      createApiKeyConnectException(ApiKeyConnectErrorCode.UNKNOWN).getStatus(),
    ).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });
});
