import { describeMurekaHttpError } from '@api/services/integrations/mureka/utils/mureka-error.util';

function httpError(status: number, data: unknown): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { data, status },
  });
}

describe('describeMurekaHttpError', () => {
  it.each([
    [
      'top-level message',
      httpError(400, { message: 'prompt is too short' }),
      'Mureka rejected the request (HTTP 400: prompt is too short)',
    ],
    [
      'msg field',
      httpError(402, { msg: 'insufficient balance' }),
      'Mureka rejected the request (HTTP 402: insufficient balance)',
    ],
    [
      'nested error object',
      httpError(429, { error: { message: 'rate limited' } }),
      'Mureka rejected the request (HTTP 429: rate limited)',
    ],
    [
      'error string with trace id',
      httpError(403, { error: 'forbidden model', trace_id: 'tr-1' }),
      'Mureka rejected the request (HTTP 403: forbidden model, trace tr-1)',
    ],
    [
      'plain text body',
      httpError(502, 'Bad gateway'),
      'Mureka rejected the request (HTTP 502: Bad gateway)',
    ],
    [
      'empty body',
      httpError(500, {}),
      'Mureka rejected the request (HTTP 500)',
    ],
  ])('reads the reason from a %s', (_label, error, expected) => {
    expect(describeMurekaHttpError(error)).toBe(expected);
  });

  it('truncates a very long provider reason', () => {
    const message = describeMurekaHttpError(
      httpError(400, { message: 'x'.repeat(1000) }),
    );

    expect(message).toBe(
      `Mureka rejected the request (HTTP 400: ${'x'.repeat(300)})`,
    );
  });

  it('returns undefined for an error without an HTTP response', () => {
    expect(
      describeMurekaHttpError(new Error('socket hang up')),
    ).toBeUndefined();
  });
});
