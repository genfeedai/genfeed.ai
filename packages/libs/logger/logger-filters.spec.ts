import { describe, expect, it } from 'vitest';
import { shouldDropLoggerInfo } from './logger-filters';

describe('shouldDropLoggerInfo', () => {
  it('drops Nest route-map bootstrap noise', () => {
    expect(
      shouldDropLoggerInfo({
        message: 'Mapped {/v1/auth/bootstrap, GET} route',
        service: 'RouterExplorer',
      }),
    ).toBe(true);
    expect(
      shouldDropLoggerInfo({
        message: 'AuthController {/v1/auth}:',
        service: 'RoutesResolver',
      }),
    ).toBe(true);
  });

  it('keeps Better Auth failures and Nest request unauthorized lines', () => {
    expect(
      shouldDropLoggerInfo({
        message: 'Better Auth request failed',
        service: 'LoggerService',
      }),
    ).toBe(false);
    expect(
      shouldDropLoggerInfo({
        message: 'Request unauthorized',
        statusCode: 401,
      }),
    ).toBe(false);
  });
});
