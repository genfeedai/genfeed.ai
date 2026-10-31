import { describe, expect, it } from 'bun:test';
import {
  isTrustedDesktopAppOrigin,
  resolveBundledAppUrl,
  resolveRemoteAppUrl,
} from './app-shell-origin.util';

describe('desktop app shell origins', () => {
  it('accepts the exact bundled loopback origin', () => {
    expect(resolveBundledAppUrl('http://127.0.0.1:3230').origin).toBe(
      'http://127.0.0.1:3230',
    );
  });

  it('derives the remote shell from the trusted auth endpoint origin', () => {
    expect(resolveRemoteAppUrl('https://app.genfeed.ai/oauth/cli').origin).toBe(
      'https://app.genfeed.ai',
    );
  });

  it('rejects insecure remote and non-loopback bundled origins', () => {
    expect(() =>
      resolveRemoteAppUrl('http://app.genfeed.ai/oauth/cli'),
    ).toThrow('must use HTTPS');
    expect(() => resolveBundledAppUrl('http://localhost:3230')).toThrow(
      '127.0.0.1',
    );
  });

  it('trusts only origin-only HTTPS or HTTP loopback values', () => {
    expect(isTrustedDesktopAppOrigin('https://app.genfeed.ai')).toBe(true);
    expect(isTrustedDesktopAppOrigin('http://127.0.0.1:3230')).toBe(true);
    expect(isTrustedDesktopAppOrigin('http://app.genfeed.ai')).toBe(false);
    expect(isTrustedDesktopAppOrigin('https://app.genfeed.ai/path')).toBe(
      false,
    );
  });
});
