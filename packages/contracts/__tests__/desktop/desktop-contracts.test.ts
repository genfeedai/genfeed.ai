import { describe, expect, it } from 'vitest';
import {
  buildDesktopAssetUrl,
  DESKTOP_ASSET_PROTOCOL_HOST,
  DESKTOP_ASSET_PROTOCOL_SCHEME,
  DESKTOP_IPC_CHANNELS,
  parseDesktopAssetUrl,
} from '../../src/desktop';

describe('buildDesktopAssetUrl', () => {
  it('builds a genfeed-asset URL for a valid asset id', () => {
    expect(buildDesktopAssetUrl('asset_123-ABC')).toBe(
      'genfeed-asset://local/asset_123-ABC',
    );
  });

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
  it('parses a valid asset URL', () => {
    expect(parseDesktopAssetUrl('genfeed-asset://local/asset-1')).toBe(
      'asset-1',
    );
  });

  it('rejects other protocols and hosts', () => {
    expect(parseDesktopAssetUrl('https://local/asset-1')).toBeNull();
    expect(parseDesktopAssetUrl('genfeed-asset://remote/asset-1')).toBeNull();
  });

  it('rejects URLs with credentials, ports, query, or hash', () => {
    expect(
      parseDesktopAssetUrl('genfeed-asset://user@local/asset-1'),
    ).toBeNull();
    expect(
      parseDesktopAssetUrl('genfeed-asset://user:pw@local/asset-1'),
    ).toBeNull();
    expect(
      parseDesktopAssetUrl('genfeed-asset://local:8080/asset-1'),
    ).toBeNull();
    expect(
      parseDesktopAssetUrl('genfeed-asset://local/asset-1?x=1'),
    ).toBeNull();
    expect(
      parseDesktopAssetUrl('genfeed-asset://local/asset-1#frag'),
    ).toBeNull();
  });

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

describe('DESKTOP_IPC_CHANNELS', () => {
  it('prefixes every channel with desktop:', () => {
    for (const channel of Object.values(DESKTOP_IPC_CHANNELS)) {
      expect(channel).toMatch(/^desktop:/);
    }
  });

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
