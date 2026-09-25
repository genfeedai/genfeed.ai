import { describe, expect, it } from 'bun:test';
import {
  DesktopServerService,
  type DesktopValueCipher,
} from './server.service';
import {
  buildDefaultServerProfile,
  buildSelfHostedServerProfile,
  deriveSelfHostedEndpoint,
  GENFEED_CLOUD_ENDPOINTS,
  normalizeApiEndpoint,
} from './server-profile.util';
import { buildDesktopSessionStorageKey } from './session.service';
import type { DesktopKeyValueStore } from './store.service';

class MemoryStore implements DesktopKeyValueStore {
  readonly values = new Map<string, string>();

  async deleteValue(key: string): Promise<void> {
    this.values.delete(key);
  }

  async getValue(key: string): Promise<string | null> {
    return this.getValueSync(key);
  }

  getValueSync(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  async setValue(key: string, value: string): Promise<void> {
    this.setValueSync(key, value);
  }

  setValueSync(key: string, value: string): void {
    this.values.set(key, value);
  }
}

/** Reversible stand-in for safeStorage that proves values are not plaintext. */
const cipher: DesktopValueCipher = {
  decrypt: (value) => Buffer.from(value, 'base64').toString('utf8'),
  encrypt: (value) => Buffer.from(value, 'utf8').toString('base64'),
};

const healthyFetch = async () => ({
  json: async () => ({ service: 'api', status: 'ok' }),
  ok: true,
  status: 200,
});

describe('server URL validation', () => {
  it('adds the /v1 base path to a bare origin and trims slashes', () => {
    expect(normalizeApiEndpoint('https://genfeed.example.com/')).toBe(
      'https://genfeed.example.com/v1',
    );
    expect(normalizeApiEndpoint(' https://api.example.com/v1/ ')).toBe(
      'https://api.example.com/v1',
    );
  });

  it('only allows plain HTTP for this computer and private networks', () => {
    expect(normalizeApiEndpoint('http://localhost:3010')).toBe(
      'http://localhost:3010/v1',
    );
    expect(normalizeApiEndpoint('http://192.168.1.20:3010/v1')).toBe(
      'http://192.168.1.20:3010/v1',
    );
    expect(() => normalizeApiEndpoint('http://genfeed.example.com')).toThrow(
      /https/,
    );
  });

  it('rejects credentials, queries, fragments, and other schemes', () => {
    expect(() => normalizeApiEndpoint('https://u:p@example.com')).toThrow();
    expect(() => normalizeApiEndpoint('https://example.com/v1?x=1')).toThrow();
    expect(() => normalizeApiEndpoint('https://example.com/#x')).toThrow();
    expect(() => normalizeApiEndpoint('ftp://example.com')).toThrow();
    expect(() => normalizeApiEndpoint('not a url')).toThrow(/full URL/);
  });
});

describe('self-hosted endpoint derivation', () => {
  it('derives sibling subdomains from an api. host', () => {
    const profile = buildSelfHostedServerProfile({
      apiEndpoint: 'https://api.acme.dev/v1',
    });

    expect(profile).toMatchObject({
      apiEndpoint: 'https://api.acme.dev/v1',
      appEndpoint: 'https://app.acme.dev',
      authEndpoint: 'https://app.acme.dev/oauth/cli',
      kind: 'self-hosted',
      mcpEndpoint: 'https://mcp.acme.dev/mcp',
      wsEndpoint: 'https://notifications.acme.dev',
    });
    expect(profile.id).toMatch(/^self-hosted-[0-9a-f]{16}$/);
  });

  it('derives the self-hosted image ports and uses the bundled shell over HTTP', () => {
    const profile = buildSelfHostedServerProfile({
      apiEndpoint: 'http://localhost:3010',
    });

    expect(profile).toMatchObject({
      apiEndpoint: 'http://localhost:3010/v1',
      appEndpoint: null,
      authEndpoint: 'http://localhost:3000/oauth/cli',
      mcpEndpoint: 'http://localhost:3014/mcp',
      wsEndpoint: 'http://localhost:3011',
    });
  });

  it('honors explicit MCP, app, and notifications URLs', () => {
    expect(
      buildSelfHostedServerProfile({
        apiEndpoint: 'https://genfeed.example.com/v1',
        appEndpoint: 'https://genfeed.example.com',
        mcpEndpoint: 'https://tools.example.com/mcp/',
        wsEndpoint: 'https://ws.example.com',
      }),
    ).toMatchObject({
      appEndpoint: 'https://genfeed.example.com',
      mcpEndpoint: 'https://tools.example.com/mcp',
      wsEndpoint: 'https://ws.example.com',
    });
    expect(
      deriveSelfHostedEndpoint('https://genfeed.example.com/v1', 'mcp'),
    ).toBe('https://genfeed.example.com/mcp');
  });

  it('keeps env-var endpoints as the default server', () => {
    expect(buildDefaultServerProfile({})).toMatchObject({
      apiEndpoint: GENFEED_CLOUD_ENDPOINTS.api,
      id: 'cloud',
      kind: 'cloud',
      mcpEndpoint: GENFEED_CLOUD_ENDPOINTS.mcp,
    });
    expect(
      buildDefaultServerProfile({
        apiEndpoint: 'http://localhost:3010/v1',
        authEndpoint: 'http://localhost:3000/oauth/cli',
        mcpEndpoint: 'http://localhost:3014/mcp',
      }),
    ).toMatchObject({
      apiEndpoint: 'http://localhost:3010/v1',
      authEndpoint: 'http://localhost:3000/oauth/cli',
      kind: 'self-hosted',
      mcpEndpoint: 'http://localhost:3014/mcp',
    });
  });
});

describe('DesktopServerService', () => {
  const defaultProfile = buildDefaultServerProfile({});

  it('uses the default server until one is picked in-app', () => {
    const service = new DesktopServerService(
      new MemoryStore(),
      cipher,
      defaultProfile,
      healthyFetch,
    );

    expect(service.getActiveProfile()).toEqual(defaultProfile);
    expect(service.getState().isUsingDefault).toBe(true);
  });

  it('switches to a validated self-hosted server and stores it encrypted', async () => {
    const store = new MemoryStore();
    const requested: string[] = [];
    const service = new DesktopServerService(
      store,
      cipher,
      defaultProfile,
      async (url) => {
        requested.push(url);
        return healthyFetch();
      },
    );

    const profile = await service.select({
      kind: 'self-hosted',
      selfHosted: { apiEndpoint: 'https://api.acme.dev' },
    });

    expect(requested).toEqual(['https://api.acme.dev/v1/health']);
    expect(profile.apiEndpoint).toBe('https://api.acme.dev/v1');
    expect(service.getActiveProfile()).toEqual(profile);
    expect(service.getState()).toMatchObject({
      active: { kind: 'self-hosted' },
      isUsingDefault: false,
      selfHosted: { apiEndpoint: 'https://api.acme.dev/v1' },
    });
    for (const value of store.values.values()) {
      expect(value).not.toContain('acme');
    }

    await service.select({ kind: 'cloud' });
    expect(service.getActiveProfile().id).toBe('cloud');
    // The self-hosted server stays remembered for switching back.
    expect(service.getSelfHostedConfig()?.apiEndpoint).toBe(
      'https://api.acme.dev/v1',
    );
  });

  it('refuses servers that fail validation', async () => {
    const service = new DesktopServerService(
      new MemoryStore(),
      cipher,
      defaultProfile,
      async () => ({ json: async () => ({}), ok: false, status: 404 }),
    );

    expect(
      await service.validateSelfHosted({ apiEndpoint: 'https://x.example' }),
    ).toMatchObject({ isValid: false });
    await expect(
      service.select({
        kind: 'self-hosted',
        selfHosted: { apiEndpoint: 'https://x.example' },
      }),
    ).rejects.toThrow(/HTTP 404/);
    expect(service.getActiveProfile()).toEqual(defaultProfile);

    const unreachable = new DesktopServerService(
      new MemoryStore(),
      cipher,
      defaultProfile,
      async () => {
        throw new Error('ECONNREFUSED');
      },
    );
    expect(
      (
        await unreachable.validateSelfHosted({
          apiEndpoint: 'http://localhost',
        })
      ).error,
    ).toMatch(/Could not reach/);
    expect(
      (await unreachable.validateSelfHosted({ apiEndpoint: 'http://evil.com' }))
        .error,
    ).toMatch(/https/);
  });

  it('keeps a separate stored session per server', async () => {
    const store = new MemoryStore();
    const service = new DesktopServerService(
      store,
      cipher,
      defaultProfile,
      healthyFetch,
    );
    const selfHosted = await service.select({
      kind: 'self-hosted',
      selfHosted: { apiEndpoint: 'https://api.acme.dev' },
    });

    expect(buildDesktopSessionStorageKey('cloud')).toBe('desktop.session');
    expect(buildDesktopSessionStorageKey(selfHosted.id)).not.toBe(
      'desktop.session',
    );

    store.setValueSync(buildDesktopSessionStorageKey('cloud'), 'cloud-session');
    expect(service.getState().signedInServerIds).toEqual(['cloud']);

    store.setValueSync(
      buildDesktopSessionStorageKey(selfHosted.id),
      'self-hosted-session',
    );
    expect(service.getState().signedInServerIds.sort()).toEqual(
      ['cloud', selfHosted.id].sort(),
    );
  });
});
