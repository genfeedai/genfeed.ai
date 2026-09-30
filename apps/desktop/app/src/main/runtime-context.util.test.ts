import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  IDesktopEnvironment,
  IDesktopRuntimeContext,
} from '@genfeedai/contracts/desktop';
import {
  assertDesktopRuntimeAvailable,
  assertDesktopServerSwitchAvailable,
  commitDesktopRuntimeSwitch,
  createDesktopRuntimeContext,
  type DesktopRuntimeTransitionState,
  getDesktopProviderContext,
  selectDesktopRuntimeDataService,
  transitionDesktopRuntimeToCloud,
} from './runtime-context.util';
import { DesktopStoreService } from './store.service';

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
  it('cannot replace a newly unavailable state with ready after selection failure', async () => {
    let state: IDesktopRuntimeContext['status'] = 'ready';
    const events: string[] = [];
    await expect(
      commitDesktopRuntimeSwitch(
        () => state,
        true,
        async () => {
          state = 'unavailable';
          throw new Error('selection failed');
        },
        (status) => {
          state = status;
          events.push(status);
        },
      ),
    ).rejects.toThrow('selection failed');
    expect(state).toBe('unavailable');
    expect(events).toEqual(['switching']);
  });
  it.each(['unavailable', 'switching'] as const)(
    'rejects selection if runtime becomes %s during native confirmation',
    async (nextStatus) => {
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
      ).rejects.toThrow(
        nextStatus === 'unavailable' ? 'Restart Genfeed Desktop' : 'switching',
      );
      expect(state).toBe(nextStatus);
      expect(select).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
    },
  );
});

const fixtureDirectories: string[] = [];
afterEach(() => {
  mock.restore();
  for (const directory of fixtureDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('actual runtime transition and dispatch boundaries', () => {
  const provider = {
    provider: 'ollama' as const,
    networkAccess: 'local' as const,
  };
  it.each([
    'disconnect',
    'close',
    'mkdirSync',
    'writeFileSync',
    'chmodSync',
    'renameSync',
    'relaunch',
    'exit',
  ] as const)(
    'fails closed with coherent cache/disk/state when %s rejects',
    async (stage) => {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'genfeed-runtime-recovery-'),
      );
      fixtureDirectories.push(directory);
      const store = new DesktopStoreService(
        path.join(directory, 'desktop-state.json'),
      );
      store.setValueSync('desktop.runtime.mode', 'local');
      store.setValueSync('provider.fixture', 'encrypted-fixture');
      const before = fs.readFileSync(store.getPath(), 'utf8');
      const failure = new Error(`fixture ${stage} failed`);
      let state: DesktopRuntimeTransitionState = {
        status: 'ready',
        isOfflineMode: true,
        localProvider: provider,
      };
      let revision = 0;
      const emitted: IDesktopRuntimeContext[] = [];
      const phases: string[] = [];
      await expect(
        transitionDesktopRuntimeToCloud({
          previous: state,
          publish: (next) => {
            state = next;
            emitted.push(
              createDesktopRuntimeContext({
                ...input,
                ...next,
                revision: ++revision,
                isLocalInitialized: true,
              }),
            );
          },
          closeLocalRuntime: async () => {
            phases.push('disconnect');
            if (stage === 'disconnect') throw failure;
            phases.push('close');
            if (stage === 'close') throw failure;
          },
          persistCloudMode: () => {
            phases.push('persist');
            if (
              [
                'mkdirSync',
                'writeFileSync',
                'chmodSync',
                'renameSync',
              ].includes(stage)
            ) {
              const fault = spyOn(
                fs,
                stage as
                  | 'mkdirSync'
                  | 'writeFileSync'
                  | 'chmodSync'
                  | 'renameSync',
              ).mockImplementation(() => {
                throw failure;
              });
              try {
                store.setValueSync('desktop.runtime.mode', 'cloud');
              } finally {
                fault.mockRestore();
              }
            } else store.setValueSync('desktop.runtime.mode', 'cloud');
          },
          relaunch: () => {
            phases.push('relaunch');
            if (stage === 'relaunch') throw failure;
          },
          exit: () => {
            phases.push('exit');
            if (stage === 'exit') throw failure;
          },
        }),
      ).rejects.toThrow(failure);
      const committed = stage === 'relaunch' || stage === 'exit';
      const mode = committed ? 'cloud' : 'local';
      expect(store.getValueSync('desktop.runtime.mode')).toBe(mode);
      expect(
        new DesktopStoreService(store.getPath()).getValueSync(
          'desktop.runtime.mode',
        ),
      ).toBe(mode);
      expect(store.getValueSync('provider.fixture')).toBe('encrypted-fixture');
      if (!committed)
        expect(fs.readFileSync(store.getPath(), 'utf8')).toBe(before);
      else
        expect(JSON.parse(fs.readFileSync(store.getPath(), 'utf8'))).toEqual({
          'desktop.runtime.mode': 'cloud',
          'provider.fixture': 'encrypted-fixture',
        });
      expect(state.status).toBe(committed ? 'switching' : 'unavailable');
      expect(state.isOfflineMode).toBe(!committed);
      expect(emitted.map((snapshot) => snapshot.revision)).toEqual([1, 2]);
      expect(emitted[1]?.generationExecution).toBe('unknown');
      expect(emitted[1]?.localProvider).toEqual(committed ? null : provider);
      const selectServer = mock(async () => {
        throw new Error('self-hosted validation or persistence failed');
      });
      const beforeServerSwitch = { ...state };
      await expect(
        commitDesktopRuntimeSwitch(
          () => state.status,
          true,
          selectServer,
          (status) => {
            state = { ...state, status };
          },
        ),
      ).rejects.toThrow(committed ? 'switching' : 'Restart Genfeed Desktop');
      expect(selectServer).not.toHaveBeenCalled();
      expect(state).toEqual(beforeServerSwitch);
      expect(() =>
        assertDesktopServerSwitchAvailable(state.status, false),
      ).toThrow(committed ? 'switching' : 'Restart Genfeed Desktop');
      const local = { generateContent: mock(() => 'local fixture') };
      const cloud = { generateContent: mock(() => 'cloud fixture') };
      expect(() =>
        selectDesktopRuntimeDataService(state.status, {
          cloudService: cloud,
          hasCloudSession: true,
          isOfflineMode: state.isOfflineMode,
          localService: local,
        }).generateContent(),
      ).toThrow();
      expect(() => {
        assertDesktopRuntimeAvailable(state.status);
        local.generateContent();
      }).toThrow();
      expect(() => assertDesktopRuntimeAvailable(state.status)).toThrow(
        committed ? 'switching' : 'Restart Genfeed Desktop',
      );
      expect(local.generateContent).not.toHaveBeenCalled();
      expect(cloud.generateContent).not.toHaveBeenCalled();
      const evidenceDirectory =
        process.env.GENFEED_DESKTOP_RUNTIME_EVIDENCE_DIR;
      if (evidenceDirectory) {
        fs.mkdirSync(evidenceDirectory, { recursive: true });
        fs.writeFileSync(
          path.join(evidenceDirectory, `recovery-${stage}.json`),
          JSON.stringify(
            {
              stage,
              committed,
              phases,
              before,
              after: fs.readFileSync(store.getPath(), 'utf8'),
              cacheMode: store.getValueSync('desktop.runtime.mode'),
              restartedMode: new DesktopStoreService(
                store.getPath(),
              ).getValueSync('desktop.runtime.mode'),
              fileMode: fs.statSync(store.getPath()).mode & 0o777,
              state,
              emitted,
              localCalls: local.generateContent.mock.calls.length,
              cloudCalls: cloud.generateContent.mock.calls.length,
            },
            null,
            2,
          ),
        );
      }
      if (stage === 'disconnect') expect(phases).toEqual(['disconnect']);
      if (stage === 'close') expect(phases).toEqual(['disconnect', 'close']);
    },
  );
  it.each(['ready', 'unavailable'] as const)(
    'restores actual %s state for a failure before teardown',
    async (status) => {
      const previous: DesktopRuntimeTransitionState = {
        status,
        isOfflineMode: true,
        localProvider: provider,
      };
      let state = previous;
      let first = true;
      const destructive = mock(async () => {});
      await expect(
        transitionDesktopRuntimeToCloud({
          previous,
          publish: (next) => {
            if (first) {
              first = false;
              throw new Error('publish fixture failure');
            }
            state = next;
          },
          closeLocalRuntime: destructive,
          persistCloudMode: () => {},
          relaunch: () => {},
          exit: () => {},
        }),
      ).rejects.toThrow('publish fixture failure');
      expect(state).toEqual(previous);
      expect(destructive).not.toHaveBeenCalled();
    },
  );
  it('distinguishes missing configuration from a saved unavailable provider', () => {
    const missing = createDesktopRuntimeContext({
      ...input,
      isOfflineMode: true,
      isLocalInitialized: true,
    });
    const unavailable = createDesktopRuntimeContext({
      ...input,
      isOfflineMode: true,
      isLocalInitialized: true,
      status: 'unavailable',
      localProvider: provider,
    });
    expect(missing.localProvider).toBeNull();
    expect(unavailable.localProvider).toEqual(provider);
    expect(unavailable.generationExecution).toBe('unknown');
  });
  it('preserves healthy local and cloud dispatch selection', () => {
    const local = { generateContent: mock(() => 'local fixture') };
    const cloud = { generateContent: mock(() => 'cloud fixture') };
    expect(
      selectDesktopRuntimeDataService('ready', {
        cloudService: cloud,
        hasCloudSession: true,
        isOfflineMode: true,
        localService: local,
      }).generateContent(),
    ).toBe('local fixture');
    expect(
      selectDesktopRuntimeDataService('ready', {
        cloudService: cloud,
        hasCloudSession: true,
        isOfflineMode: false,
        localService: local,
      }).generateContent(),
    ).toBe('cloud fixture');
    expect(local.generateContent).toHaveBeenCalledTimes(1);
    expect(cloud.generateContent).toHaveBeenCalledTimes(1);
  });
});
