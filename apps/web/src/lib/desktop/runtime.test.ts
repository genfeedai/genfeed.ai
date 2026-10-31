import { afterEach, describe, expect, it } from 'vitest';
import { getDesktopBridge } from './runtime';

describe('getDesktopBridge', () => {
  afterEach(() => {
    delete (window as Window & { genfeedDesktop?: unknown }).genfeedDesktop;
  });

  it('returns the injected Electron bridge when present', () => {
    const bridge = { ping: () => 'ok' };
    Object.defineProperty(window, 'genfeedDesktop', {
      configurable: true,
      value: bridge,
    });

    expect(getDesktopBridge()).toBe(bridge);
  });

  it('returns null when the browser has no desktop bridge', () => {
    expect(getDesktopBridge()).toBeNull();
  });
});
