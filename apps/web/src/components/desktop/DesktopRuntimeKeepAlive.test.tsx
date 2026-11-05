import '@testing-library/jest-dom/vitest';
import type { IDesktopRuntimeContext } from '@genfeedai/contracts/desktop';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopRuntimeContext } from '@/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context';
import DesktopRuntimeKeepAlive from './DesktopRuntimeKeepAlive';

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

const getRuntimeContext = vi.fn(() => Promise.resolve(context));

function RuntimeStatus() {
  const runtime = useDesktopRuntimeContext();
  return <p>{`Runtime ${runtime.status}`}</p>;
}

function ProtectedRoot({ isShellMounted }: { isShellMounted: boolean }) {
  return (
    <>
      <DesktopRuntimeKeepAlive />
      {isShellMounted ? <RuntimeStatus /> : null}
    </>
  );
}

async function settle() {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
}

describe('DesktopRuntimeKeepAlive', () => {
  beforeEach(() => {
    getRuntimeContext.mockClear();
    Object.defineProperty(window, 'genfeedDesktop', {
      configurable: true,
      value: {
        app: {
          getRuntimeContext,
          onDidChangeRuntimeContext: () => () => {},
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'genfeedDesktop');
  });

  it('keeps the runtime ready across a shell remount without a second bridge read', async () => {
    const view = render(<ProtectedRoot isShellMounted />);
    await settle();
    expect(screen.getByText('Runtime ready')).toBeInTheDocument();

    // The organization boundary unmounts the shell while it reconciles.
    view.rerender(<ProtectedRoot isShellMounted={false} />);
    await settle();
    view.rerender(<ProtectedRoot isShellMounted />);

    expect(screen.getByText('Runtime ready')).toBeInTheDocument();
    expect(getRuntimeContext).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
