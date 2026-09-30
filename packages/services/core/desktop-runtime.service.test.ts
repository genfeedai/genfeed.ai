import type { IDesktopRuntimeContext } from '@genfeedai/contracts/desktop';
import { describe, expect, it, vi } from 'vitest';
import {
  canSubmitStudioGeneration,
  DesktopRuntimeService,
  getDesktopCreditsVisibility,
  getDesktopLocalCostState,
} from './desktop-runtime.service';

const context: IDesktopRuntimeContext = {
  version: 1,
  runtimeId: 'launch-a',
  revision: 0,
  status: 'ready',
  selectedServerId: 'cloud',
  selectedServerKind: 'cloud',
  selectedApiEndpoint: 'https://api.genfeed.ai/v1',
  runtimeMode: 'cloud',
  generationExecution: 'remote',
  localProvider: null,
};
function fixture() {
  let event!: (value: IDesktopRuntimeContext) => void;
  let resolve!: (value: IDesktopRuntimeContext) => void;
  const detach = vi.fn();
  const rpc = vi.fn(
    () =>
      new Promise<IDesktopRuntimeContext>((done) => {
        resolve = done;
      }),
  );
  const bridge = {
    getRuntimeContext: rpc,
    onDidChangeRuntimeContext: (
      callback: (value: IDesktopRuntimeContext) => void,
    ) => {
      event = callback;
      return detach;
    },
  };
  const service = new DesktopRuntimeService(
    () => true,
    () => bridge,
  );
  return {
    service,
    rpc,
    detach,
    resolve: (value: IDesktopRuntimeContext) => resolve(value),
    event: (value: IDesktopRuntimeContext) => event(value),
  };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('shared authoritative runtime store', () => {
  it('never calls IPC for web consumers and has stable SSR unknown snapshot', () => {
    const read = vi.fn();
    const service = new DesktopRuntimeService(() => false, read);
    expect(service.getServerSnapshot()).toBe(service.getServerSnapshot());
    const off = service.subscribe(() => {});
    expect(service.getSnapshot()).toEqual({ status: 'web', context: null });
    expect(read).not.toHaveBeenCalled();
    off();
  });
  it.each(['before cleanup', 'during grace', 'after remount'] as const)(
    'retains newer event %s over delayed initial RPC throughout StrictMode remount',
    async (phase) => {
      const f = fixture();
      const listener = vi.fn();
      const off = f.service.subscribe(listener);
      const newer = {
        ...context,
        revision: 4,
        status: 'unavailable' as const,
        generationExecution: 'unknown' as const,
        runtimeMode: 'local' as const,
        localProvider: {
          provider: 'ollama' as const,
          networkAccess: 'local' as const,
        },
      };
      if (phase === 'before cleanup') f.event(newer);
      off();
      const calls = listener.mock.calls.length;
      if (phase === 'during grace') {
        f.event(newer);
        expect(listener).toHaveBeenCalledTimes(calls);
      }
      const remount = f.service.subscribe(() => {});
      if (phase === 'after remount') f.event(newer);
      f.resolve(context);
      await flush();
      expect(f.rpc).toHaveBeenCalledTimes(1);
      expect(f.detach).not.toHaveBeenCalled();
      expect(f.service.getSnapshot()).toEqual({
        status: 'unavailable',
        context: newer,
      });
      expect(getDesktopLocalCostState(f.service.getSnapshot())).toBe('unknown');
      remount();
      await flush();
      expect(f.detach).toHaveBeenCalledTimes(1);
    },
  );
  it('starts a fresh lifetime for a changed bridge and ignores old callbacks', async () => {
    let oldEvent!: (value: IDesktopRuntimeContext) => void;
    const oldDetach = vi.fn();
    const oldBridge = {
      getRuntimeContext: vi.fn(async () => context),
      onDidChangeRuntimeContext: (
        callback: (value: IDesktopRuntimeContext) => void,
      ) => {
        oldEvent = callback;
        return oldDetach;
      },
    };
    const nextBridge = {
      getRuntimeContext: vi.fn(async () => ({
        ...context,
        runtimeId: 'next-launch',
      })),
      onDidChangeRuntimeContext: () => vi.fn(),
    };
    let bridge = oldBridge as Pick<
      import('@genfeedai/contracts/desktop').IGenfeedDesktopBridge['app'],
      'getRuntimeContext' | 'onDidChangeRuntimeContext'
    >;
    const service = new DesktopRuntimeService(
      () => true,
      () => bridge,
    );
    const off = service.subscribe(() => {});
    await flush();
    off();
    bridge = nextBridge;
    expect(service.getCurrentSnapshot().status).toBe('loading');
    const fresh = service.subscribe(() => {});
    await flush();
    oldEvent({ ...context, revision: 999 });
    expect(service.getSnapshot().context?.runtimeId).toBe('next-launch');
    expect(oldDetach).toHaveBeenCalledTimes(1);
    expect(nextBridge.getRuntimeContext).toHaveBeenCalledTimes(1);
    fresh();
    await flush();
  });
  it('deduplicates a synchronous development remount but discards a real unmount', async () => {
    let resolve!: (value: IDesktopRuntimeContext) => void;
    const bridge = {
      getRuntimeContext: vi.fn(
        () =>
          new Promise<IDesktopRuntimeContext>((done) => {
            resolve = done;
          }),
      ),
      onDidChangeRuntimeContext: vi.fn(() => vi.fn()),
    };
    const service = new DesktopRuntimeService(
      () => true,
      () => bridge,
    );
    const off = service.subscribe(() => {});
    off();
    const remount = service.subscribe(() => {});
    expect(bridge.getRuntimeContext).toHaveBeenCalledTimes(1);
    resolve(context);
    await flush();
    expect(service.getSnapshot().status).toBe('ready');
    remount();
    await flush();
    const fresh = service.subscribe(() => {});
    expect(bridge.getRuntimeContext).toHaveBeenCalledTimes(2);
    fresh();
  });
  it('subscribes before one deduplicated RPC and rejects late initial data', async () => {
    const f = fixture();
    const off1 = f.service.subscribe(() => {});
    const off2 = f.service.subscribe(() => {});
    expect(f.rpc).toHaveBeenCalledTimes(1);
    f.event({
      ...context,
      revision: 2,
      status: 'switching',
      generationExecution: 'unknown',
    });
    f.resolve(context);
    await flush();
    expect(f.service.getSnapshot().status).toBe('switching');
    f.event({ ...context, revision: 1 });
    expect(f.service.getSnapshot().status).toBe('switching');
    off1();
    expect(f.detach).not.toHaveBeenCalled();
    off2();
    await flush();
    expect(f.detach).toHaveBeenCalledTimes(1);
  });
  it('cannot restore readiness from a late RPC after an invalid runtime event', async () => {
    const f = fixture();
    const off = f.service.subscribe(() => {});
    f.event({
      ...context,
      selectedApiEndpoint: 'https://server.example/v1?credential=hidden',
    });
    f.resolve({ ...context, revision: 100 });
    await flush();
    expect(f.service.getSnapshot()).toEqual({
      status: 'unavailable',
      context: null,
    });
    off();
  });
  it('rejects a different-runtime late RPC and discards detached results/events', async () => {
    const f = fixture();
    const off = f.service.subscribe(() => {});
    f.event({ ...context, runtimeId: 'new-launch', revision: 0 });
    f.resolve(context);
    await flush();
    expect(f.service.getSnapshot().context?.runtimeId).toBe('new-launch');
    off();
    await flush();
    f.event({ ...context, revision: 10 });
    expect(f.service.getSnapshot().context).toBeNull();
  });
  it('uses unavailable for missing bridge, failed RPC or invalid payload', async () => {
    const missing = new DesktopRuntimeService(
      () => true,
      () => null,
    );
    const off = missing.subscribe(() => {});
    expect(missing.getSnapshot().status).toBe('unavailable');
    off();
    const failed = new DesktopRuntimeService(
      () => true,
      () => ({
        getRuntimeContext: async () => {
          throw new Error('IPC unavailable');
        },
        onDidChangeRuntimeContext: () => () => {},
      }),
    );
    const done = failed.subscribe(() => {});
    await flush();
    expect(failed.getSnapshot().context).toBeNull();
    expect(failed.getSnapshot().status).toBe('unavailable');
    done();
    const f = fixture();
    const stop = f.service.subscribe(() => {});
    f.resolve({
      ...context,
      selectedApiEndpoint: 'https://api.example/v1?secret=1',
    });
    await flush();
    expect(f.service.getSnapshot().status).toBe('unavailable');
    stop();
  });
  it('keeps selected profile/mode separate from transport and provider fees', () => {
    expect(
      getDesktopCreditsVisibility({ status: 'ready', context }),
    ).toMatchObject({
      clientSurface: 'desktop',
      selectedServerKind: 'cloud',
      runtimeMode: 'cloud',
    });
    const local = {
      ...context,
      runtimeMode: 'local' as const,
      generationExecution: 'local-byok' as const,
      localProvider: {
        provider: 'replicate' as const,
        networkAccess: 'remote' as const,
      },
    };
    expect(canSubmitStudioGeneration({ status: 'ready', context: local })).toBe(
      false,
    );
    expect(getDesktopLocalCostState({ status: 'ready', context: local })).toBe(
      'remote',
    );
    expect(
      getDesktopLocalCostState({
        status: 'ready',
        context: {
          ...local,
          localProvider: { provider: 'ollama', networkAccess: 'local' },
        },
      }),
    ).toBe('local');
    expect(
      getDesktopLocalCostState({
        status: 'ready',
        context: {
          ...local,
          localProvider: null,
          generationExecution: 'unknown',
        },
      }),
    ).toBe('missing');
    expect(canSubmitStudioGeneration({ status: 'switching', context })).toBe(
      false,
    );
    expect(
      canSubmitStudioGeneration({ status: 'unavailable', context: null }),
    ).toBe(false);
    expect(
      canSubmitStudioGeneration({
        status: 'ready',
        context: { ...context, selectedServerKind: 'self-hosted' },
      }),
    ).toBe(true);
  });
});
