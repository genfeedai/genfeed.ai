import { resolveApiBaseUrl } from '@mcp/shared/utils/api-url.util';

describe('resolveApiBaseUrl', () => {
  it('appends /v1 to a bare base URL (the configured shape)', () => {
    expect(resolveApiBaseUrl('http://api:3010')).toBe('http://api:3010/v1');
    expect(resolveApiBaseUrl('https://api.genfeed.ai')).toBe(
      'https://api.genfeed.ai/v1',
    );
  });

  it('strips trailing slashes before appending', () => {
    expect(resolveApiBaseUrl('http://api:3010/')).toBe('http://api:3010/v1');
    expect(resolveApiBaseUrl('http://api:3010///')).toBe('http://api:3010/v1');
  });

  it('does not double up when the base already ends in a version segment', () => {
    expect(resolveApiBaseUrl('http://api:3010/v1')).toBe('http://api:3010/v1');
    expect(resolveApiBaseUrl('http://api:3010/v1/')).toBe('http://api:3010/v1');
    expect(resolveApiBaseUrl('https://api.genfeed.ai/v2')).toBe(
      'https://api.genfeed.ai/v2',
    );
  });

  it('returns an empty string for empty/undefined input', () => {
    expect(resolveApiBaseUrl('')).toBe('');
    expect(resolveApiBaseUrl(undefined)).toBe('');
    expect(resolveApiBaseUrl('   ')).toBe('');
  });
});
