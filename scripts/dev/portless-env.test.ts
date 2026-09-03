import { describe, expect, it } from 'vitest';
import {
  buildDirectEnvironment,
  buildPortlessEnvironment,
  PORTLESS_PROXY_ENVIRONMENT,
  resolveDirectOrigins,
  resolvePortlessOrigins,
  sanitizeNodeColorEnvironment,
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

  it('preserves the worktree prefix on clean HTTPS origins', () => {
    const origins = resolvePortlessOrigins(
      'api',
      'https://fix-auth.api.genfeed.localhost',
    );

    expect(origins).toEqual({
      api: 'https://fix-auth.api.genfeed.localhost',
      app: 'https://fix-auth.app.genfeed.localhost',
      docs: 'https://fix-auth.docs.genfeed.localhost',
      files: 'https://fix-auth.files.genfeed.localhost',
      mcp: 'https://fix-auth.mcp.genfeed.localhost',
      notifications: 'https://fix-auth.notifications.genfeed.localhost',
      website: 'https://fix-auth.website.genfeed.localhost',
    });
  });

  it('drops NO_COLOR when FORCE_COLOR is set so Node does not warn in workers', () => {
    expect(
      sanitizeNodeColorEnvironment({
        FORCE_COLOR: '1',
        NO_COLOR: '1',
        PATH: '/usr/bin',
      }),
    ).toEqual({
      FORCE_COLOR: '1',
      PATH: '/usr/bin',
    });
    expect(
      sanitizeNodeColorEnvironment({
        NO_COLOR: '1',
        PATH: '/usr/bin',
      }),
    ).toEqual({
      NO_COLOR: '1',
      PATH: '/usr/bin',
    });
  });

  it('pins canonical HTTPS proxy settings without hosts-file synchronization', () => {
    expect(PORTLESS_PROXY_ENVIRONMENT).toEqual({
      PORTLESS_HTTPS: '1',
      PORTLESS_PORT: '443',
      PORTLESS_SYNC_HOSTS: '0',
      PORTLESS_TLD: 'localhost',
    });
  });

  it('keeps fixed ports inside the explicit direct-runtime environment', () => {
    expect(resolveDirectOrigins({ APP_PORT: '3100' })).toMatchObject({
      api: 'http://genfeed.localhost:3010',
      app: 'http://genfeed.localhost:3100',
      notifications: 'http://genfeed.localhost:3111',
    });
    expect(resolveDirectOrigins({ APP_PORT: '65536' }).app).toBe(
      'http://genfeed.localhost:3000',
    );
    // Out-of-range / non-integer ports fall back; bounds 1 and 65535 are valid.
    expect(resolveDirectOrigins({ APP_PORT: '0' }).app).toBe(
      'http://genfeed.localhost:3000',
    );
    expect(resolveDirectOrigins({ APP_PORT: '1' }).app).toBe(
      'http://genfeed.localhost:1',
    );
    expect(resolveDirectOrigins({ APP_PORT: '65535' }).app).toBe(
      'http://genfeed.localhost:65535',
    );
    expect(resolveDirectOrigins({ APP_PORT: 'not-a-port' }).app).toBe(
      'http://genfeed.localhost:3000',
    );

    expect(
      buildDirectEnvironment({
        currentService: 'app',
        existingEnv: {},
      }),
    ).toMatchObject({
      API_URL: 'http://genfeed.localhost:3010',
      NEXT_PUBLIC_API_ENDPOINT: 'http://genfeed.localhost:3000/v1',
      PORT: '3000',
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
