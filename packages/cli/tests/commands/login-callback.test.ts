import { get } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exchangeAuthCode, waitForAdminSession } from '../../src/commands/login';
import { GenfeedError } from '../../src/utils/errors';

const { mockOpenExternalUrl } = vi.hoisted(() => ({
  mockOpenExternalUrl: vi.fn<(url: string) => Promise<void>>(async () => {}),
}));

vi.mock('../../src/utils/browser', () => ({
  openExternalUrl: (url: string) => mockOpenExternalUrl(url),
}));

vi.mock('../../src/ui/theme', () => ({
  formatHeader: (value: string) => value,
  formatLabel: (label: string, value: string) => `${label}: ${value}`,
  formatSuccess: (value: string) => value,
  formatWarning: (value: string) => value,
  print: vi.fn(),
}));

const ENDPOINTS = {
  apiBaseUrl: 'https://api.selfhost.dev/v1',
  appUrl: 'https://app.selfhost.dev',
  authUrl: 'https://app.selfhost.dev/oauth/cli',
};

function hitCallback(port: string, query: string): Promise<{ body: string; status: number }> {
  return new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${port}/callback?${query}`, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on('end', () => resolve({ body, status: res.statusCode ?? 0 }));
    }).on('error', reject);
  });
}

describe('browser login callback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mockOpenExternalUrl.mockClear();
  });

  it('exchanges the first callback once and answers later hits as already handled', async () => {
    let finishExchange: (response: Response) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finishExchange = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = waitForAdminSession(ENDPOINTS);
    await vi.waitFor(() => expect(mockOpenExternalUrl).toHaveBeenCalled());
    const authUrl = new URL(mockOpenExternalUrl.mock.calls[0]?.[0] ?? '');
    const port = authUrl.searchParams.get('port') ?? '';
    const state = authUrl.searchParams.get('state') ?? '';

    // First callback is still exchanging when the second one arrives.
    const first = hitCallback(port, `code=one&state=${state}`);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const second = await hitCallback(port, `code=two&state=${state}`);

    expect(second.status).toBe(409);
    expect(second.body).toBe('Callback already handled');

    finishExchange(
      new Response(JSON.stringify({ session: { cookieValue: 'session-cookie' } }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    );

    expect((await first).status).toBe(200);
    await expect(pending).resolves.toEqual({ cookieValue: 'session-cookie' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects with a clear error when the exchange never answers', async () => {
    const controller = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          })
      )
    );

    const pending = exchangeAuthCode(ENDPOINTS.apiBaseUrl, {
      code: 'code-1',
      codeVerifier: 'verifier-1',
      state: 'state-1',
    });
    const assertion = expect(pending).rejects.toThrow(GenfeedError);

    expect(timeoutSpy).toHaveBeenCalledWith(60_000);
    controller.abort(new DOMException('The operation timed out', 'TimeoutError'));

    await assertion;
    await expect(pending).rejects.toThrow('Token exchange timed out');
  });
});
