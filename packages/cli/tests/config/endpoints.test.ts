import { describe, expect, it } from 'vitest';
import {
  deriveAppUrl,
  normalizeBaseUrl,
  resolveLoginEndpoints,
  SAAS_API_URL,
  SAAS_APP_URL,
} from '../../src/config/endpoints';

describe('config/endpoints', () => {
  describe('normalizeBaseUrl', () => {
    it.each([
      ['https://api.genfeed.ai/v1/', 'https://api.genfeed.ai/v1'],
      ['  https://api.genfeed.ai/v1  ', 'https://api.genfeed.ai/v1'],
      ['https://api.genfeed.ai/v1///', 'https://api.genfeed.ai/v1'],
      ['https://api.genfeed.ai/v1', 'https://api.genfeed.ai/v1'],
    ])('normalizes %s to %s', (input, expected) => {
      expect(normalizeBaseUrl(input)).toBe(expected);
    });
  });

  describe('deriveAppUrl', () => {
    it('swaps the api. subdomain for app.', () => {
      expect(deriveAppUrl('https://api.example.com/v1')).toBe('https://app.example.com');
    });

    it('derives the SaaS app URL from the SaaS API URL', () => {
      expect(deriveAppUrl(SAAS_API_URL)).toBe(SAAS_APP_URL);
    });

    it.each([
      'http://localhost:3010/v1',
      'http://127.0.0.1:3010/v1',
      'http://genfeed.localhost:3010/v1',
      'http://[::1]:3010/v1',
    ])('maps the local API port to the local app port for %s', (apiUrl) => {
      expect(deriveAppUrl(apiUrl)).toBe(new URL(apiUrl).origin.replace('3010', '3000'));
    });

    it('falls back to the origin for path-mounted self-hosted APIs', () => {
      expect(deriveAppUrl('https://selfhost.example.com/api/v1')).toBe(
        'https://selfhost.example.com'
      );
    });

    it('keeps a non-standard local port untouched', () => {
      expect(deriveAppUrl('http://localhost:8080/v1')).toBe('http://localhost:8080');
    });

    it('falls back to the SaaS app URL for unparseable input', () => {
      expect(deriveAppUrl('not-a-url')).toBe(SAAS_APP_URL);
    });
  });

  describe('resolveLoginEndpoints', () => {
    it('derives auth and app URLs from a self-hosted API URL', () => {
      expect(resolveLoginEndpoints('https://api.example.com/v1')).toEqual({
        apiBaseUrl: 'https://api.example.com/v1',
        appUrl: 'https://app.example.com',
        authUrl: 'https://app.example.com/oauth/cli',
      });
    });

    it('prefers an explicit app URL over derivation', () => {
      expect(
        resolveLoginEndpoints('https://api.example.com/v1', 'https://studio.example.com/')
      ).toEqual({
        apiBaseUrl: 'https://api.example.com/v1',
        appUrl: 'https://studio.example.com',
        authUrl: 'https://studio.example.com/oauth/cli',
      });
    });

    it('falls back to SaaS defaults when the API URL is empty', () => {
      expect(resolveLoginEndpoints('')).toEqual({
        apiBaseUrl: SAAS_API_URL,
        appUrl: SAAS_APP_URL,
        authUrl: `${SAAS_APP_URL}/oauth/cli`,
      });
    });
  });
});
