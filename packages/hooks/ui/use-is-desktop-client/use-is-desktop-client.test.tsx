import { useIsDesktopClient } from '@hooks/ui/use-is-desktop-client/use-is-desktop-client';
import { renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

type RuntimeConfigGlobal = typeof globalThis & {
  __GENFEED_RUNTIME_CONFIG__?: { clientSurface?: 'desktop' | 'web' };
};

const runtimeGlobal = globalThis as RuntimeConfigGlobal;
const originalDesktopShell = process.env.NEXT_PUBLIC_DESKTOP_SHELL;

function SurfaceProbe() {
  return <span>{useIsDesktopClient() ? 'desktop' : 'web'}</span>;
}

describe('useIsDesktopClient', () => {
  afterEach(() => {
    delete runtimeGlobal.__GENFEED_RUNTIME_CONFIG__;
    if (originalDesktopShell === undefined) {
      delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
    } else {
      process.env.NEXT_PUBLIC_DESKTOP_SHELL = originalDesktopShell;
    }
  });

  it('reports the web surface by default', () => {
    const { result } = renderHook(() => useIsDesktopClient());

    expect(result.current).toBe(false);
  });

  it('follows the runtime config once rendered on the client', () => {
    runtimeGlobal.__GENFEED_RUNTIME_CONFIG__ = { clientSurface: 'desktop' };

    const { result } = renderHook(() => useIsDesktopClient());

    expect(result.current).toBe(true);
  });

  // The hosted studio inside the desktop shell: the server never sees the
  // runtime config, so hydration must start from the web surface it rendered.
  it('renders the web surface for hydration when only the runtime config says desktop', () => {
    runtimeGlobal.__GENFEED_RUNTIME_CONFIG__ = { clientSurface: 'desktop' };

    expect(renderToString(<SurfaceProbe />)).toContain('web');
  });

  it('renders the desktop surface for hydration in the bundled desktop build', () => {
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = '1';

    expect(renderToString(<SurfaceProbe />)).toContain('desktop');
  });
});
