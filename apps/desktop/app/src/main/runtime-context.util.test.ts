import { describe, expect, it } from 'bun:test';
import type { IDesktopEnvironment } from '@genfeedai/contracts/desktop';
import {
  commitDesktopRuntimeSwitch,
  createDesktopRuntimeContext,
  getDesktopProviderContext,
} from './runtime-context.util';

const environment: IDesktopEnvironment = {
  apiEndpoint: 'https://private.example/v1',
  appEndpoint: 'http://127.0.0.1:3230',
  appName: 'desktop',
  appPort: 3230,
  authEndpoint: 'https://private.example/auth',
  cdnUrl: 'https://cdn.genfeed.ai',
  mcpEndpoint: 'https://mcp.genfeed.ai',
  serverId: 'private',
  serverKind: 'self-hosted',
  wsEndpoint: 'https://private.example',
  sessionDbPath: 'secret-db-path',
  sentryDsn: 'secret-telemetry',
};
const input = {
  environment,
  runtimeId: 'launch-1',
  revision: 0,
  status: 'ready' as const,
  hasSession: true,
  isOfflineMode: false,
  isLocalInitialized: false,
  localProvider: null,
};

describe('authoritative nonsecret runtime context', () => {
  it('uses selected profile independently of cloud CDN or shell transport', () => {
    const context = createDesktopRuntimeContext(input);
    expect(context.selectedServerKind).toBe('self-hosted');
    expect(context.selectedApiEndpoint).toBe(environment.apiEndpoint);
    expect(context.generationExecution).toBe('remote');
    expect(context.localProvider).toBeNull();
    expect(JSON.stringify(context)).not.toContain('secret-');
    expect(JSON.stringify(context)).not.toContain('cdn.genfeed');
    expect(context).not.toHaveProperty('authEndpoint');
  });
  it.each([
    'https://user:password@server.example/v1',
    'https://server.example/v1?token=secret',
    'https://server.example/v1#secret',
    'file:///secret',
  ])('rejects unsafe selected URLs: %s', (apiEndpoint) => {
    expect(() =>
      createDesktopRuntimeContext({
        ...input,
        environment: { ...environment, apiEndpoint },
      }),
    ).toThrow();
  });
  it('requires actual session or initialized local service, not a preset', () => {
    expect(
      createDesktopRuntimeContext({ ...input, hasSession: false })
        .generationExecution,
    ).toBe('unknown');
    const localProvider = {
      provider: 'ollama' as const,
      networkAccess: 'local' as const,
    };
    expect(
      createDesktopRuntimeContext({
        ...input,
        isOfflineMode: true,
        localProvider,
      }).generationExecution,
    ).toBe('unknown');
    const local = createDesktopRuntimeContext({
      ...input,
      isOfflineMode: true,
      isLocalInitialized: true,
      localProvider,
    });
    expect(local.generationExecution).toBe('local-byok');
    expect(local.localProvider).toEqual(localProvider);
    expect(
      createDesktopRuntimeContext({
        ...input,
        isOfflineMode: true,
        isLocalInitialized: true,
      }).generationExecution,
    ).toBe('unknown');
  });
  it.each([
    ['http://localhost:1234/v1', 'local'],
    ['http://127.0.0.1:11434', 'local'],
    ['http://[::1]:1234/v1', 'local'],
    ['https://api.example/v1', 'remote'],
    ['invalid', 'unknown'],
  ])(
    'describes configured transport without exposing endpoint: %s',
    (baseUrl, expected) => {
      const context = getDesktopProviderContext({
        provider: 'openai-compatible',
        baseUrl,
        model: 'model',
        apiKeyConfigured: true,
      });
      expect(context?.networkAccess).toBe(expected);
      expect(context).not.toHaveProperty('baseUrl');
      expect(context).not.toHaveProperty('apiKeyConfigured');
    },
  );
  it('retains only old profile identity during switching', () => {
    const context = createDesktopRuntimeContext({
      ...input,
      status: 'switching',
      revision: 2,
    });
    expect(context.selectedServerId).toBe('private');
    expect(context.generationExecution).toBe('unknown');
  });
  it('does not emit or select when native confirmation is canceled', async () => {
    const events: string[] = [];
    await expect(
      commitDesktopRuntimeSwitch(
        false,
        async () => {
          events.push('select');
          return 'next';
        },
        (status) => events.push(status),
      ),
    ).rejects.toThrow('cancelled');
    expect(events).toEqual([]);
  });
  it('restores old ready state only if selection fails before commit', async () => {
    const events: string[] = [];
    await expect(
      commitDesktopRuntimeSwitch(
        true,
        async () => {
          throw new Error('write failed');
        },
        (status) => events.push(status),
      ),
    ).rejects.toThrow('write failed');
    expect(events).toEqual(['switching', 'ready']);
    events.length = 0;
    expect(
      await commitDesktopRuntimeSwitch(
        true,
        async () => 'next',
        (status) => events.push(status),
      ),
    ).toBe('next');
    expect(events).toEqual(['switching']);
  });
});
