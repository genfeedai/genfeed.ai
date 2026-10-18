import { isClientAbortedRequest } from '@api/helpers/utils/client-aborted-request/client-aborted-request.util';

describe('isClientAbortedRequest', () => {
  it('matches the body-parser error raised when the client hangs up mid-body', () => {
    const aborted = Object.assign(new Error('request aborted'), {
      code: 'ECONNABORTED',
      statusCode: 400,
      type: 'request.aborted',
    });

    expect(isClientAbortedRequest(aborted)).toBe(true);
  });

  it('keeps other body-parser failures reportable', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      statusCode: 413,
      type: 'entity.too.large',
    });

    expect(isClientAbortedRequest(tooLarge)).toBe(false);
  });

  it('ignores values that are not error objects', () => {
    expect(isClientAbortedRequest(undefined)).toBe(false);
    expect(isClientAbortedRequest('request aborted')).toBe(false);
  });
});
