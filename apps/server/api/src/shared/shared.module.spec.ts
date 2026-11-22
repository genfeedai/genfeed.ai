import {
  AxiosErrorInterceptorSetup,
  SharedModule,
} from '@api/shared/shared.module';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import type { AxiosError } from 'axios';

type ErrorHandler = (error: AxiosError) => Promise<never>;

function setUpInterceptor() {
  const levels: string[] = [];
  let handler: ErrorHandler | undefined;
  const httpService = {
    axiosRef: {
      interceptors: {
        response: {
          use: (_onFulfilled: undefined, onRejected: ErrorHandler) => {
            handler = onRejected;
          },
        },
      },
    },
  } as unknown as HttpService;
  const logger = {
    error: () => levels.push('error'),
    warn: () => levels.push('warn'),
  } as unknown as LoggerService;

  new AxiosErrorInterceptorSetup(httpService, logger).onModuleInit();

  return {
    levels,
    reject: (status?: number) =>
      handler?.({
        config: { method: 'get', url: 'https://provider.example/v1' },
        message: 'failed',
        response: status === undefined ? undefined : { status },
      } as AxiosError).catch(() => undefined),
  };
}

describe('SharedModule', () => {
  it('should be defined', () => {
    expect(SharedModule).toBeDefined();
  });
});

describe('AxiosErrorInterceptorSetup', () => {
  it.each([
    [400, 'warn'],
    [404, 'warn'],
    [409, 'warn'],
    [422, 'warn'],
    [401, 'error'],
    [402, 'error'],
    [403, 'error'],
    [429, 'error'],
    [500, 'error'],
    [503, 'error'],
    [undefined, 'error'],
  ])('logs an upstream status of %s at the %s level', async (status, level) => {
    const { levels, reject } = setUpInterceptor();

    await reject(status);

    expect(levels).toEqual([level]);
  });
});
