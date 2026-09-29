import { describe, expect, it } from 'vitest';
import {
  buildDesktopAssetUrl,
  buildDesktopThreadLink,
  DESKTOP_ASSET_PROTOCOL_HOST,
  DESKTOP_ASSET_PROTOCOL_SCHEME,
  DESKTOP_IPC_CHANNELS,
  parseDesktopAssetUrl,
  parseDesktopThreadLink,
} from '../../src/desktop';

describe('buildDesktopAssetUrl', () => {
  it('round-trips through parseDesktopAssetUrl', () => {
    const url = buildDesktopAssetUrl('a1_b2-c3');

    expect(parseDesktopAssetUrl(url)).toBe('a1_b2-c3');
  });

  it('rejects ids with invalid characters', () => {
    expect(() => buildDesktopAssetUrl('bad/id')).toThrow(
      'Invalid desktop asset id.',
    );
    expect(() => buildDesktopAssetUrl('bad id')).toThrow(
      'Invalid desktop asset id.',
    );
    expect(() => buildDesktopAssetUrl('')).toThrow('Invalid desktop asset id.');
  });

  it('rejects ids longer than 128 characters', () => {
    expect(() => buildDesktopAssetUrl('a'.repeat(129))).toThrow(
      'Invalid desktop asset id.',
    );
    expect(buildDesktopAssetUrl('a'.repeat(128))).toContain('local/');
  });
});

describe('parseDesktopAssetUrl', () => {
  it('rejects nested paths and invalid ids', () => {
    expect(parseDesktopAssetUrl('genfeed-asset://local/a/b')).toBeNull();
    expect(parseDesktopAssetUrl('genfeed-asset://local/')).toBeNull();
    expect(parseDesktopAssetUrl('genfeed-asset://local/bad%20id')).toBeNull();
  });

  it('returns null for strings that are not URLs', () => {
    expect(parseDesktopAssetUrl('not a url')).toBeNull();
    expect(parseDesktopAssetUrl('')).toBeNull();
  });
});

describe('desktop thread links', () => {
  it('round-trips a thread id through the deep link', () => {
    const link = buildDesktopThreadLink('thread_123-ABC');

    expect(link).toBe('genfeedai-desktop://thread/thread_123-ABC');
    expect(parseDesktopThreadLink(link)).toBe('thread_123-ABC');
  });

  it('refuses to build a link for an unsafe thread id', () => {
    expect(() => buildDesktopThreadLink('bad/id')).toThrow(
      'Invalid desktop thread id.',
    );
    expect(() => buildDesktopThreadLink('')).toThrow(
      'Invalid desktop thread id.',
    );
  });

  it('parses only well-formed thread links', () => {
    expect(parseDesktopThreadLink('genfeedai-desktop://auth')).toBeNull();
    expect(parseDesktopThreadLink('genfeedai-desktop://thread/')).toBeNull();
    expect(parseDesktopThreadLink('genfeedai-desktop://thread/a/b')).toBeNull();
    expect(
      parseDesktopThreadLink('genfeedai-desktop://thread/a?code=1'),
    ).toBeNull();
    expect(
      parseDesktopThreadLink('genfeedai-desktop://thread/%2e%2e%2fadmin'),
    ).toBeNull();
    expect(
      parseDesktopThreadLink('https://app.genfeed.ai/thread/thread-1'),
    ).toBeNull();
    expect(parseDesktopThreadLink('not a url')).toBeNull();
  });
});

describe('DESKTOP_IPC_CHANNELS', () => {
  it('has no duplicate channel names', () => {
    const values = Object.values(DESKTOP_IPC_CHANNELS);

    expect(new Set(values).size).toBe(values.length);
  });
});

describe('asset protocol constants', () => {
  it('exposes the scheme and host used by the bridge', () => {
    expect(DESKTOP_ASSET_PROTOCOL_SCHEME).toBe('genfeed-asset');
    expect(DESKTOP_ASSET_PROTOCOL_HOST).toBe('local');
  });
});
