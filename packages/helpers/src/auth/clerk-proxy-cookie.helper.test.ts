import { getStaleClerkClientCookieNames } from '@helpers/auth/clerk-proxy-cookie.helper';
import { describe, expect, it } from 'vitest';

type CookieMap = Record<string, string>;

function buildCookies(cookieMap: CookieMap) {
  const entries = Object.entries(cookieMap);

  return {
    getAll: () =>
      entries.map(([name, value]) => ({
        name,
        value,
      })),
    has: (name: string) => entries.some(([cookieName]) => cookieName === name),
  };
}

describe('clerk-proxy-cookie.helper', () => {
  it('returns stale suffixed client cookie when only unsuffixed db token exists', () => {
    const cookies = buildCookies({
      __clerk_db_jwt: 'db-token',
      __client_uat_2HoNKQCy: 'uat-token',
    });

    const result = getStaleClerkClientCookieNames(cookies);

    expect(result).toEqual(['__client_uat_2HoNKQCy']);
  });

  it('does not return stale cookies when matching suffixed db token exists', () => {
    const cookies = buildCookies({
      __clerk_db_jwt: 'db-token',
      __clerk_db_jwt_2HoNKQCy: 'db-token-suffixed',
      __client_uat_2HoNKQCy: 'uat-token',
    });

    const result = getStaleClerkClientCookieNames(cookies);

    expect(result).toEqual([]);
  });

  it('returns stale cookies when matching suffixed db token is missing', () => {
    const cookies = buildCookies({
      __client_uat_2HoNKQCy: 'uat-token',
    });

    const result = getStaleClerkClientCookieNames(cookies);

    expect(result).toEqual(['__client_uat_2HoNKQCy']);
  });

  it('returns all stale suffixed client cookies when multiple stale suffixes exist', () => {
    const cookies = buildCookies({
      __clerk_db_jwt: 'db-token',
      __clerk_db_jwt_2HoNKQCy: 'db-token-suffixed',
      __client_uat_2HoNKQCy: 'uat-token-1',
      __client_uat_LegacySuffix: 'uat-token-2',
    });

    const result = getStaleClerkClientCookieNames(cookies);

    expect(result).toEqual(['__client_uat_LegacySuffix']);
  });
});
