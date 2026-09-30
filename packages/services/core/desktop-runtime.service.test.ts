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
  const service = new DesktopRuntimeService(
    () => true,
    () => ({
      getRuntimeContext: rpc,
      onDidChangeRuntimeContext: (callback) => {
        event = callback;
        return detach;
      },
    }),
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
  it('subscribes before one deduplicated RPC and rejects late initial data', async () => {
    const f = fixture();
    const off1 = f.service.subscribe(() => {});
    const off2 = f.service.subscribe(() => {});
    expect(f.rpc).toHaveBeenCalledTimes(1);
    f.event({ ...context, revision: 2, status: 'switching' });
    f.resolve(context);
    await flush();
    expect(f.service.getSnapshot().status).toBe('switching');
    f.event({ ...context, revision: 1 });
    expect(f.service.getSnapshot().status).toBe('switching');
    off1();
    expect(f.detach).not.toHaveBeenCalled();
    off2();
    expect(f.detach).toHaveBeenCalledTimes(1);
  });
  it('rejects a different-runtime late RPC and discards detached results/events', async () => {
    const f = fixture();
    const off = f.service.subscribe(() => {});
    f.event({ ...context, runtimeId: 'new-launch', revision: 0 });
    f.resolve(context);
    await flush();
    expect(f.service.getSnapshot().context?.runtimeId).toBe('new-launch');
    off();
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
