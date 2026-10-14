import { beforeEach, describe, expect, it } from 'vitest';
import {
  OAUTH_CONNECT_CONTEXT_STORAGE_KEY,
  readOAuthConnectContext,
  rememberOAuthConnectContext,
} from './oauth-connect-context';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const CREDENTIAL_ID = '22222222-2222-4222-8222-222222222222';

describe('oauth connect context', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('stores a brand and credential id for a fresh authorization', () => {
    rememberOAuthConnectContext({
      brandId: BRAND_ID,
      credentialId: CREDENTIAL_ID,
    });

    expect(readOAuthConnectContext()).toEqual({
      brandId: BRAND_ID,
      credentialId: CREDENTIAL_ID,
    });
    expect(
      window.sessionStorage.getItem(OAUTH_CONNECT_CONTEXT_STORAGE_KEY),
    ).not.toContain('oauth-code');
  });

  it('drops values that are not entity ids', () => {
    rememberOAuthConnectContext({
      brandId: 'brand-1',
      credentialId: 'cred-1',
    });

    expect(
      window.sessionStorage.getItem(OAUTH_CONNECT_CONTEXT_STORAGE_KEY),
    ).toBeNull();

    window.sessionStorage.setItem(
      OAUTH_CONNECT_CONTEXT_STORAGE_KEY,
      JSON.stringify({
        brandId: BRAND_ID,
        credentialId: 'not-an-id',
        code: 'oauth-code',
      }),
    );

    expect(readOAuthConnectContext()).toEqual({ brandId: BRAND_ID });
  });
});
