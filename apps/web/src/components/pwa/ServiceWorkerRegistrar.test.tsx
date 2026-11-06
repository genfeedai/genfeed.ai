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
type Registration = { scope?: string; url: string };

// Fake service-worker container: records each registration the page makes.
function installServiceWorker(): Registration[] {
  const registrations: Registration[] = [];
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register: async (url: string, options?: { scope?: string }) => {
        registrations.push({ scope: options?.scope, url });
      },
    },
  });
  return registrations;
}

afterEach(() => {
  desktopClient.mockReturnValue(false);
  vi.unstubAllEnvs();
});

describe('ServiceWorkerRegistrar', () => {
  it('does not register on desktop even in production', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    desktopClient.mockReturnValue(true);
    const registrations = installServiceWorker();
    const { default: Registrar } = await import(
      '@/components/pwa/ServiceWorkerRegistrar'
    );
    render(<Registrar />);
    expect(registrations).toEqual([]);
  });

  it('still registers on the web in production', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    desktopClient.mockReturnValue(false);
    const registrations = installServiceWorker();
    const { default: Registrar } = await import(
      '@/components/pwa/ServiceWorkerRegistrar'
    );
    render(<Registrar />);
    expect(registrations).toEqual([{ scope: '/', url: '/serwist/sw.js' }]);
  });

  it('renders nothing', () => {
    const { container } = render(<ServiceWorkerRegistrar />);

    expect(container).toBeEmptyDOMElement();
  });

  it('does not register outside production', () => {
    const registrations = installServiceWorker();

    render(<ServiceWorkerRegistrar />);

    expect(registrations).toEqual([]);
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

  it('keeps unrelated failures reportable', () => {
    expect(isIgnorableServiceWorkerError(new Error('Network down'))).toBe(
      false,
    );
  });
});
