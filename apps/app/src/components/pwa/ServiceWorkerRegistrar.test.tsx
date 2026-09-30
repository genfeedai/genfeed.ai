import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ServiceWorkerRegistrar, {
  isIgnorableServiceWorkerError,
} from './ServiceWorkerRegistrar';

describe('ServiceWorkerRegistrar', () => {
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
