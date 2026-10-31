import { afterEach, describe, expect, it } from 'bun:test';
import { DesktopConfigService } from './config.service';

const ORIGINAL_ENV = {
  GENFEED_DESKTOP_API_URL: process.env.GENFEED_DESKTOP_API_URL,
  GENFEED_DESKTOP_AUTH_URL: process.env.GENFEED_DESKTOP_AUTH_URL,
  GENFEED_DESKTOP_CDN_URL: process.env.GENFEED_DESKTOP_CDN_URL,
  GENFEED_DESKTOP_PROVIDER_TIMEOUT_MS:
    process.env.GENFEED_DESKTOP_PROVIDER_TIMEOUT_MS,
  GENFEED_DESKTOP_WS_URL: process.env.GENFEED_DESKTOP_WS_URL,
};

const clearDesktopEndpointEnv = () => {
  delete process.env.GENFEED_DESKTOP_API_URL;
  delete process.env.GENFEED_DESKTOP_AUTH_URL;
  delete process.env.GENFEED_DESKTOP_CDN_URL;
  delete process.env.GENFEED_DESKTOP_WS_URL;
};

const restoreEnvValue = (key: keyof typeof ORIGINAL_ENV) => {
  const value = ORIGINAL_ENV[key];
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
};

describe('DesktopConfigService', () => {
  afterEach(() => {
    restoreEnvValue('GENFEED_DESKTOP_API_URL');
    restoreEnvValue('GENFEED_DESKTOP_AUTH_URL');
    restoreEnvValue('GENFEED_DESKTOP_CDN_URL');
    restoreEnvValue('GENFEED_DESKTOP_PROVIDER_TIMEOUT_MS');
    restoreEnvValue('GENFEED_DESKTOP_WS_URL');
  });

  it('captures the local provider timeout through the config service', () => {
    process.env.GENFEED_DESKTOP_PROVIDER_TIMEOUT_MS = '1250';

    const service = new DesktopConfigService();

    expect(service.getLocalProviderTimeoutMs()).toBe(1250);
  });

  it('defaults installed desktop builds to Genfeed Cloud endpoints', () => {
    clearDesktopEndpointEnv();

    const environment = new DesktopConfigService().getEnvironment();

    expect(environment.apiEndpoint).toBe('https://api.genfeed.ai/v1');
    expect(environment.authEndpoint).toBe('https://app.genfeed.ai/oauth/cli');
    expect(environment.cdnUrl).toBe('https://cdn.genfeed.ai');
    expect(environment.wsEndpoint).toBe('https://notifications.genfeed.ai');
    expect(environment.mcpEndpoint).toBe('https://mcp.genfeed.ai/mcp');
    expect(environment.serverId).toBe('cloud');
    expect(environment.serverKind).toBe('cloud');
  });

  it('allows self-hosted and local development endpoints to override cloud', () => {
    process.env.GENFEED_DESKTOP_API_URL = 'http://localhost:3010/v1';
    process.env.GENFEED_DESKTOP_AUTH_URL = 'http://localhost:3000/oauth/cli';
    process.env.GENFEED_DESKTOP_CDN_URL = 'http://localhost:3010/cdn';
    process.env.GENFEED_DESKTOP_WS_URL = 'http://localhost:3020';

    const environment = new DesktopConfigService().getEnvironment();

    expect(environment.apiEndpoint).toBe('http://localhost:3010/v1');
    expect(environment.authEndpoint).toBe('http://localhost:3000/oauth/cli');
    expect(environment.cdnUrl).toBe('http://localhost:3010/cdn');
    expect(environment.wsEndpoint).toBe('http://localhost:3020');
    expect(environment.mcpEndpoint).toBe('http://localhost:3014/mcp');
    expect(environment.serverKind).toBe('self-hosted');
  });

  it('builds the environment for an in-app selected server', () => {
    clearDesktopEndpointEnv();
    const service = new DesktopConfigService();

    const environment = service.getEnvironment({
      apiEndpoint: 'https://api.acme.dev/v1',
      appEndpoint: 'https://app.acme.dev',
      authEndpoint: 'https://app.acme.dev/oauth/cli',
      id: 'self-hosted-0123456789abcdef',
      kind: 'self-hosted',
      label: 'api.acme.dev',
      mcpEndpoint: 'https://mcp.acme.dev/mcp',
      wsEndpoint: 'https://notifications.acme.dev',
    });

    expect(environment).toMatchObject({
      apiEndpoint: 'https://api.acme.dev/v1',
      authEndpoint: 'https://app.acme.dev/oauth/cli',
      mcpEndpoint: 'https://mcp.acme.dev/mcp',
      serverId: 'self-hosted-0123456789abcdef',
      wsEndpoint: 'https://notifications.acme.dev',
    });
    expect(service.getDefaultServerProfile().id).toBe('cloud');
  });
});
