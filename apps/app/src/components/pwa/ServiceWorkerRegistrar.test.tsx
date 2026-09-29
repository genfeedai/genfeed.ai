import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { isIgnorableServiceWorkerError } from './ServiceWorkerRegistrar';

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
