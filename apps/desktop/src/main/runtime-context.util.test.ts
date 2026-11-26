import { describe, expect, it, mock } from 'bun:test';
import type {
  IDesktopEnvironment,
  IDesktopRuntimeContext,
} from '@genfeedai/contracts/desktop';
import {
  assertDesktopRuntimeAvailable,
  assertDesktopServerSwitchAvailable,
  commitDesktopRuntimeSwitch,
  createDesktopRuntimeContext,
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
  sentryDsn: 'secret-telemetry',
};
const input = {
  environment,
  runtimeId: 'launch-1',
  revision: 0,
  status: 'ready' as const,
  hasSession: true,
};

describe('authoritative nonsecret runtime context', () => {
  it('uses selected profile independently of cloud CDN or shell transport', () => {
    const context = createDesktopRuntimeContext(input);
    expect(context.selectedServerKind).toBe('self-hosted');
    expect(context.selectedApiEndpoint).toBe(environment.apiEndpoint);
    expect(context.generationExecution).toBe('remote');
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
  it('reports remote generation only with an actual session', () => {
    expect(
      createDesktopRuntimeContext({ ...input, hasSession: false })
        .generationExecution,
    ).toBe('unknown');
  });
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
        () => 'ready',
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
    let state: IDesktopRuntimeContext['status'] = 'ready';
    const publish = (status: IDesktopRuntimeContext['status']) => {
      state = status;
      events.push(status);
    };
    await expect(
      commitDesktopRuntimeSwitch(
        () => state,
        true,
        async () => {
          throw new Error('write failed');
        },
        publish,
      ),
    ).rejects.toThrow('write failed');
    expect(events).toEqual(['switching', 'ready']);
    events.length = 0;
    expect(
      await commitDesktopRuntimeSwitch(
        () => state,
        true,
        async () => 'next',
        publish,
      ),
    ).toBe('next');
    expect(events).toEqual(['switching']);
  });
  it('rejects overlapping confirmation before opening another native dialog', () => {
    const dialog = mock(() => 'native confirmation');
    expect(() => {
      assertDesktopServerSwitchAvailable('ready', true);
      dialog();
    }).toThrow('already pending');
    expect(dialog).not.toHaveBeenCalled();
    assertDesktopServerSwitchAvailable('ready', false);
    expect(dialog()).toBe('native confirmation');
  });
  it('rechecks status after confirmation and rejects an overlapping commit', async () => {
    let state: IDesktopRuntimeContext['status'] = 'ready';
    let release!: () => void;
    const events: string[] = [];
    const publish = (status: IDesktopRuntimeContext['status']) => {
      state = status;
      events.push(status);
    };
    assertDesktopServerSwitchAvailable(state, false);
    const first = commitDesktopRuntimeSwitch(
      () => state,
      true,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      publish,
    );
    const secondSelect = mock(async () => 'second profile');
    await expect(
      commitDesktopRuntimeSwitch(() => state, true, secondSelect, publish),
    ).rejects.toThrow('switching');
    expect(secondSelect).not.toHaveBeenCalled();
    expect(events).toEqual(['switching']);
    release();
    await first;
    expect(state).toBe('switching');
  });
  it('rejects selection if runtime starts switching during native confirmation', async () => {
    const nextStatus = 'switching' as const;
    let state: IDesktopRuntimeContext['status'] = 'ready';
    const publish = mock((status: IDesktopRuntimeContext['status']) => {
      state = status;
    });
    const select = mock(async () => {
      throw new Error('validation or store failure');
    });
    assertDesktopServerSwitchAvailable(state, false);
    const confirmation = Promise.resolve().then(() => {
      state = nextStatus;
      return true;
    });
    await expect(
      commitDesktopRuntimeSwitch(
        () => state,
        await confirmation,
        select,
        publish,
      ),
    ).rejects.toThrow('switching');
    expect(state).toBe(nextStatus);
    expect(select).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
  it('blocks runtime work while a server switch is in flight', () => {
    expect(() => assertDesktopRuntimeAvailable('switching')).toThrow(
      'switching servers',
    );
    expect(() => assertDesktopRuntimeAvailable('ready')).not.toThrow();
  });
});
