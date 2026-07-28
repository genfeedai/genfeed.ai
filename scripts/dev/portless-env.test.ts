import { describe, expect, it } from 'vitest';
import {
  buildPortlessEnvironment,
  resolvePortlessOrigins,
} from './portless-env';

describe('Portless local-development environment', () => {
  it('keeps browser API and auth traffic on the app origin', () => {
    const environment = buildPortlessEnvironment({
      currentService: 'app',
      existingEnv: {
        BETTER_AUTH_TRUSTED_ORIGINS: 'https://preview.example.com',
        FACEBOOK_REDIRECT_URI: 'http://genfeed.localhost:3000/oauth/facebook',
      },
      portlessUrl: 'https://app.genfeed.localhost',
    });

    expect(environment).toMatchObject({
      API_URL: 'https://api.genfeed.localhost',
      BETTER_AUTH_URL: 'https://api.genfeed.localhost',
      FACEBOOK_REDIRECT_URI: 'https://app.genfeed.localhost/oauth/facebook',
      GENFEEDAI_APP_URL: 'https://app.genfeed.localhost',
      GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL:
        'https://notifications.genfeed.localhost',
      NEXT_PUBLIC_API_ENDPOINT: 'https://app.genfeed.localhost/v1',
      NEXT_PUBLIC_API_URL: 'https://app.genfeed.localhost/v1',
      NEXT_PUBLIC_MCP_ENDPOINT: 'https://mcp.genfeed.localhost/mcp',
      NEXT_PUBLIC_WS_ENDPOINT: 'https://notifications.genfeed.localhost',
      WEBSOCKET_URL: 'wss://notifications.genfeed.localhost',
    });
    expect(environment.BETTER_AUTH_TRUSTED_ORIGINS?.split(',')).toEqual([
      'https://preview.example.com',
      'https://app.genfeed.localhost',
      'https://website.genfeed.localhost',
    ]);
  });

  it('preserves the worktree prefix and unprivileged proxy port', () => {
    const origins = resolvePortlessOrigins(
      'api',
      'http://fix-auth.api.genfeed.localhost:1355',
    );

    expect(origins).toEqual({
      api: 'http://fix-auth.api.genfeed.localhost:1355',
      app: 'http://fix-auth.app.genfeed.localhost:1355',
      docs: 'http://fix-auth.docs.genfeed.localhost:1355',
      files: 'http://fix-auth.files.genfeed.localhost:1355',
      mcp: 'http://fix-auth.mcp.genfeed.localhost:1355',
      notifications: 'http://fix-auth.notifications.genfeed.localhost:1355',
      website: 'http://fix-auth.website.genfeed.localhost:1355',
    });
  });

  it('supports a configured Portless TLD without hard-coding localhost', () => {
    const origins = resolvePortlessOrigins('docs', 'https://docs.genfeed.test');

    expect(origins.api).toBe('https://api.genfeed.test');
    expect(origins.docs).toBe('https://docs.genfeed.test');
    expect(origins.website).toBe('https://website.genfeed.test');
  });

  it('rejects a route that does not belong to the current service', () => {
    expect(() =>
      resolvePortlessOrigins('app', 'https://api.genfeed.localhost'),
    ).toThrow(
      'PORTLESS_URL host api.genfeed.localhost does not contain app.genfeed',
    );
  });
});
