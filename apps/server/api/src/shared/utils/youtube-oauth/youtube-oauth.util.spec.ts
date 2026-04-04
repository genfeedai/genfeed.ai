import { YoutubeOAuth2Util } from '@api/shared/utils/youtube-oauth/youtube-oauth.util';
import { describe, expect, it, vi } from 'vitest';

vi.mock('googleapis', () => {
  function OAuth2(
    this: Record<string, unknown>,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.credentials = {};
    this.setCredentials = vi.fn();
    this.getToken = vi.fn();
  }
  return {
    google: {
      auth: { OAuth2 },
    },
  };
});

describe('YoutubeOAuth2Util', () => {
  describe('createClient()', () => {
    it('creates an OAuth2 client', () => {
      const client = YoutubeOAuth2Util.createClient(
        'client-id',
        'client-secret',
        'https://example.com/callback',
      );
      expect(client).toBeDefined();
      expect(client.clientId).toBe('client-id');
      expect(client.redirectUri).toBe('https://example.com/callback');
    });

    it('returns an object with OAuth2 interface', () => {
      const client = YoutubeOAuth2Util.createClient(
        'test-id',
        'test-secret',
        'https://redirect.url',
      );
      expect(typeof client.setCredentials).toBe('function');
      expect(typeof client.getToken).toBe('function');
    });
  });
});
