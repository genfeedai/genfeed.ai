import { PublicCacheControlInterceptor } from '@api/endpoints/public/interceptors/public-cache-control.interceptor';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { Controller, type ExecutionContext, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, type Observable, of, throwError } from 'rxjs';

@Controller('public/things')
class PublicThingsController {
  @Get()
  @Cache({ ttl: 300 })
  cached(): void {}

  @Get('short')
  @Cache({ ttl: 20 })
  shortLived(): void {}

  @Get('uncached')
  uncached(): void {}
}

@Controller('private/things')
class PrivateThingsController {
  @Get()
  @Cache({ ttl: 300 })
  cached(): void {}
}

interface FakeRequest {
  headers: Record<string, string>;
  method: string;
  query: Record<string, string>;
}

function run(
  controller: new () => object,
  method: string,
  request: Partial<FakeRequest> = {},
  result: () => Observable<unknown> = () => of({ data: 1 }),
) {
  const headers = new Map<string, string>();
  const response = {
    headersSent: false,
    setHeader: (name: string, value: string) => headers.set(name, value),
  };
  const context = {
    getClass: () => controller,
    getHandler: () => controller.prototype[method],
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {},
        method: 'GET',
        query: {},
        ...request,
      }),
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  const interceptor = new PublicCacheControlInterceptor(new Reflector());
  return {
    headers,
    result: firstValueFrom(interceptor.intercept(context, { handle: result })),
  };
}

describe('PublicCacheControlInterceptor', () => {
  it('lets a cache in front hold an anonymous public read for as long as the API does, up to a minute', async () => {
    const { headers, result } = run(PublicThingsController, 'cached');
    await expect(result).resolves.toEqual({ data: 1 });
    expect(headers.get('Cache-Control')).toBe(
      'public, max-age=60, s-maxage=60',
    );
  });

  it('never promises longer than the API cache itself', async () => {
    const { headers, result } = run(PublicThingsController, 'shortLived');
    await result;
    expect(headers.get('Cache-Control')).toBe(
      'public, max-age=20, s-maxage=20',
    );
  });

  it.each([
    ['a route the API does not cache', PublicThingsController, 'uncached', {}],
    ['a route outside the public API', PrivateThingsController, 'cached', {}],
    [
      'a signed-in reader',
      PublicThingsController,
      'cached',
      { headers: { authorization: 'Bearer token' } },
    ],
    [
      'a session cookie',
      PublicThingsController,
      'cached',
      { headers: { cookie: 'session=abc' } },
    ],
    [
      'a preview of unpublished content',
      PublicThingsController,
      'cached',
      { query: { previewToken: 'signed' } },
    ],
    ['a write', PublicThingsController, 'cached', { method: 'POST' }],
  ])('sends no header for %s', async (_name, controller, method, request) => {
    const { headers, result } = run(controller, method, request);
    await result;
    expect(headers.has('Cache-Control')).toBe(false);
  });

  it('sends no header with an error', async () => {
    const { headers, result } = run(PublicThingsController, 'cached', {}, () =>
      throwError(() => new Error('boom')),
    );
    await expect(result).rejects.toThrow('boom');
    expect(headers.has('Cache-Control')).toBe(false);
  });
});
