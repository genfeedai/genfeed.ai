import { afterEach, describe, expect, it } from 'bun:test';
import type {
  IDesktopEnvironment,
  IDesktopSession,
} from '@genfeedai/desktop-contracts';
import { DesktopCloudService } from './cloud.service';

const environment: IDesktopEnvironment = {
  apiEndpoint: 'https://api.genfeed.ai/v1',
  appEndpoint: 'https://app.genfeed.ai',
  appName: 'desktop',
  appPort: 3230,
  authEndpoint: 'https://app.genfeed.ai/oauth/cli',
  cdnUrl: 'https://cdn.genfeed.ai',
  wsEndpoint: 'https://notifications.genfeed.ai',
};

const session: IDesktopSession = {
  issuedAt: '2026-04-01T09:00:00.000Z',
  token: 'gf_desktop_key',
  userEmail: 'desktop@example.com',
  userId: 'user-1',
  userName: 'Desktop User',
};

describe('DesktopCloudService', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists projects with the desktop bearer token and maps the response', async () => {
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe('https://api.genfeed.ai/v1/editor-projects');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer gf_desktop_key',
        'Content-Type': 'application/json',
      });

      return new Response(
        JSON.stringify({
          data: [
            {
              attributes: {
                name: 'Desktop Launch',
                status: 'active',
              },
              id: 'project-1',
            },
          ],
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    }) as typeof fetch;

    const service = new DesktopCloudService(environment, () => session);

    await expect(service.listProjects()).resolves.toEqual([
      {
        id: 'project-1',
        name: 'Desktop Launch',
        status: 'active',
      },
    ]);
  });

  it('publishes an existing draft through the dedicated publish endpoint', async () => {
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe(
        'https://api.genfeed.ai/v1/posts/draft-9/publish',
      );
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(
        JSON.stringify({
          content: 'Ship the desktop release today.',
          platform: 'twitter',
        }),
      );

      return new Response(
        JSON.stringify({
          data: {
            id: 'published-1',
          },
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    }) as typeof fetch;

    const service = new DesktopCloudService(environment, () => session);
    const result = await service.publishPost({
      content: 'Ship the desktop release today.',
      draftId: 'draft-9',
      platform: 'twitter',
    });

    expect(result.platform).toBe('twitter');
    expect(result.postId).toBe('published-1');
    expect(result.status).toBe('published');
  });

  it('generates desktop content through the credit-backed Genfeed server endpoint', async () => {
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe(
        'https://api.genfeed.ai/v1/posts/hook-generations',
      );
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer gf_desktop_key',
      });
      expect(init?.body).toBe(
        JSON.stringify({
          count: 1,
          platform: 'twitter',
          topic: 'Launch Genfeed Desktop',
        }),
      );

      return new Response(
        JSON.stringify({
          hooks: ['Launch faster with Genfeed Desktop.'],
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    }) as typeof fetch;

    const service = new DesktopCloudService(environment, () => session);
    const result = await service.generateContent({
      platform: 'twitter',
      prompt: 'Launch Genfeed Desktop',
      publishIntent: 'review',
      type: 'hook',
    });

    expect(result).toEqual({
      content: 'Launch faster with Genfeed Desktop.',
      hooks: ['Launch faster with Genfeed Desktop.'],
      id: '',
      platform: 'twitter',
      type: 'hook',
    });
  });

  it('rejects cloud calls without a session', async () => {
    const service = new DesktopCloudService(environment, () => null);

    await expect(service.listProjects()).rejects.toThrow(
      'Desktop session is required',
    );
  });
});
