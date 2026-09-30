import type { IDesktopRuntimeContext } from '@genfeedai/contracts/desktop';
import { act } from '@testing-library/react';
import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { useDesktopRuntimeContext } from './use-desktop-runtime-context';

it('hydrates from stable unknown and deduplicates bridge reads across consumers', async () => {
  const context: IDesktopRuntimeContext = {
    version: 1,
    runtimeId: 'hydration',
    revision: 0,
    status: 'ready',
    selectedServerId: 'cloud',
    selectedServerKind: 'cloud',
    selectedApiEndpoint: 'https://api.genfeed.ai/v1',
    runtimeMode: 'cloud',
    generationExecution: 'remote',
    localProvider: null,
  };
  let resolve!: (value: IDesktopRuntimeContext) => void;
  const detach = vi.fn();
  const rpc = vi.fn(
    () =>
      new Promise<IDesktopRuntimeContext>((done) => {
        resolve = done;
      }),
  );
  Object.defineProperty(window, 'genfeedDesktop', {
    configurable: true,
    value: {
      app: { getRuntimeContext: rpc, onDidChangeRuntimeContext: () => detach },
    },
  });
  const View = () => {
    const state = useDesktopRuntimeContext();
    return <span>{state.status}</span>;
  };
  const tree = (
    <StrictMode>
      <View />
      <View />
    </StrictMode>
  );
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree);
  document.body.append(container);
  expect(container.textContent).toBe('loadingloading');
  const onRecoverableError = vi.fn();
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, tree, { onRecoverableError });
  });
  expect(rpc).toHaveBeenCalledTimes(1);
  await act(async () => resolve(context));
  expect(container.textContent).toBe('readyready');
  expect(onRecoverableError).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  expect(detach).toHaveBeenCalledTimes(1);
  container.remove();
  Reflect.deleteProperty(window, 'genfeedDesktop');
});
