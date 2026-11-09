import { WebsiteRevalidationService } from '@api/services/website-revalidation/website-revalidation.service';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface ReceivedRequest {
  authorization: string | null;
  method: string | undefined;
  url: string;
}

/**
 * A stand-in website. Unit tests block real HTTP, so it replaces `fetch`,
 * records what it was sent, and answers `status` (or fails like a network
 * error when `status` is null).
 */
function stubWebsite(status: number | null) {
  const received: ReceivedRequest[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    received.push({
      authorization: new Headers(init.headers).get('authorization'),
      method: init.method,
      url,
    });
    if (status === null) {
      throw new TypeError('fetch failed');
    }
    return new Response(null, { status });
  });
  return received;
}

function createService(env: Record<string, string | undefined>) {
  const silent = () => undefined;
  return new WebsiteRevalidationService(
    { get: (key: string) => env[key] } as never,
    { error: silent, warn: silent } as never,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebsiteRevalidationService', () => {
  it('asks the website to clear its pages with the shared secret', async () => {
    const received = stubWebsite(200);
    const service = createService({
      GENFEEDAI_PUBLIC_URL: 'https://genfeed.example/',
      WEBSITE_REVALIDATE_SECRET: 'shared-secret',
    });

    await expect(service.revalidatePublicPages()).resolves.toBe(true);
    expect(received).toEqual([
      {
        authorization: 'Bearer shared-secret',
        method: 'POST',
        url: 'https://genfeed.example/api/revalidate',
      },
    ]);
  });

  it('calls genfeed.ai when no public website URL is configured', async () => {
    const received = stubWebsite(200);
    const service = createService({ WEBSITE_REVALIDATE_SECRET: 'shared' });

    await service.revalidatePublicPages();
    expect(received.map((request) => request.url)).toEqual([
      'https://genfeed.ai/api/revalidate',
    ]);
  });

  it.each([
    ['refuses the secret', 401],
    ['cannot be reached', null],
  ])(
    'reports false without throwing when the website %s',
    async (_label, status) => {
      stubWebsite(status);
      const service = createService({
        GENFEEDAI_PUBLIC_URL: 'https://genfeed.example',
        WEBSITE_REVALIDATE_SECRET: 'shared-secret',
      });

      await expect(service.revalidatePublicPages()).resolves.toBe(false);
    },
  );

  it('skips the call when no secret is configured', async () => {
    const received = stubWebsite(200);
    const service = createService({
      GENFEEDAI_PUBLIC_URL: 'https://genfeed.example',
    });

    await expect(service.revalidatePublicPages()).resolves.toBe(false);
    expect(received).toEqual([]);
  });
});
