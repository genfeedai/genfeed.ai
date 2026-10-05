import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ServiceWorkerRegistrar, {
  isIgnorableServiceWorkerError,
} from './ServiceWorkerRegistrar';

const desktopClient = vi.hoisted(() => vi.fn(() => false));
vi.mock('@genfeedai/config/deployment', () => ({
  isDesktopClient: desktopClient,
}));
afterEach(() => {
  desktopClient.mockReturnValue(false);
  vi.unstubAllEnvs();
});

describe('ServiceWorkerRegistrar', () => {
  it('does not register on desktop even in production', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    desktopClient.mockReturnValue(true);
    const register = vi.fn();
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });
    const { default: Registrar } = await import(
      '@/components/pwa/ServiceWorkerRegistrar'
    );
    render(<Registrar />);
    expect(desktopClient).toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('still registers on the web in production', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    desktopClient.mockReturnValue(false);
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });
    const { default: Registrar } = await import(
      '@/components/pwa/ServiceWorkerRegistrar'
    );
    render(<Registrar />);
    expect(register).toHaveBeenCalledWith('/serwist/sw.js', { scope: '/' });
  });

  it('renders nothing', () => {
    const { container } = render(<ServiceWorkerRegistrar />);

    expect(container).toBeEmptyDOMElement();
  });

  it('does not register outside production', () => {
    const register = vi.fn();
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });

    render(<ServiceWorkerRegistrar />);

    expect(register).not.toHaveBeenCalled();
  });
});

describe('isIgnorableServiceWorkerError', () => {
  it('ignores abort and 403 registration failures', () => {
    const abortError = new Error('Operation has been aborted');
    abortError.name = 'AbortError';
    expect(isIgnorableServiceWorkerError(abortError)).toBe(true);
    expect(
      isIgnorableServiceWorkerError(
        new Error(
          "Failed to register a ServiceWorker for scope ('https://app.genfeed.ai/') with script ('https://app.genfeed.ai/serwist/sw.js'): A bad HTTP response code (403)",
        ),
      ),
    ).toBe(true);
  });
});
