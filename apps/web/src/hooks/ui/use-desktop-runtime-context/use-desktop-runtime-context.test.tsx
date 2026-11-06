import type { IDesktopRuntimeContext } from '@genfeedai/contracts/desktop';
import { act } from '@testing-library/react';
import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { useDesktopRuntimeContext } from './use-desktop-runtime-context';

function RuntimeStatus() {
  const state = useDesktopRuntimeContext();
  return <span>{state.status}</span>;
}

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
  const listeners = new Set<(context: unknown) => void>();
  const rpc = vi.fn(
    () =>
      new Promise<IDesktopRuntimeContext>((done) => {
        resolve = done;
      }),
  );
  Object.defineProperty(window, 'genfeedDesktop', {
    configurable: true,
    value: {
      app: {
        getRuntimeContext: rpc,
        onDidChangeRuntimeContext: (listener: (context: unknown) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    },
  });
  const tree = (
    <StrictMode>
      <RuntimeStatus />
      <RuntimeStatus />
    </StrictMode>
  );
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree);
  document.body.append(container);
  expect(container.textContent).toBe('loadingloading');
  const recoverableErrors: unknown[] = [];
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, tree, {
      onRecoverableError: (error) => recoverableErrors.push(error),
    });
  });
  expect(rpc).toHaveBeenCalledTimes(1);
  await act(async () => resolve(context));
  expect(container.textContent).toBe('readyready');
  expect(recoverableErrors).toEqual([]);
  expect(listeners.size).toBe(1);
  await act(async () => root.unmount());
  expect(listeners.size).toBe(0);
  container.remove();
  Reflect.deleteProperty(window, 'genfeedDesktop');
});
