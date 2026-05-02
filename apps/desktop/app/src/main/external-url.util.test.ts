import { describe, expect, it } from 'bun:test';
import { buildExternalAppUrl } from './external-url.util';

describe('buildExternalAppUrl', () => {
  const authEndpoint = 'https://app.genfeed.ai/oauth/cli';

  it('builds same-origin app URLs from relative paths', () => {
    expect(buildExternalAppUrl('/settings/api-keys', authEndpoint)).toBe(
      'https://app.genfeed.ai/settings/api-keys',
    );
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(() =>
      buildExternalAppUrl('https://attacker.example', authEndpoint),
    ).toThrow('Desktop external app paths must be same-origin paths.');
    expect(() =>
      buildExternalAppUrl('//attacker.example', authEndpoint),
    ).toThrow('Desktop external app paths must be same-origin paths.');
  });
});
