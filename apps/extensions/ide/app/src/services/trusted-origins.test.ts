import { describe, expect, it } from 'bun:test';
import {
  isTrustedApiEndpoint,
  TRUSTED_API_ORIGINS,
} from './trusted-api-origins';

describe('isTrustedApiEndpoint', () => {
  describe('trusted origins', () => {
    it('accepts the default production endpoint', () => {
      expect(isTrustedApiEndpoint('https://api.genfeed.ai')).toBe(true);
    });

    it('accepts the app origin', () => {
      expect(isTrustedApiEndpoint('https://app.genfeed.ai')).toBe(true);
    });

    it('accepts localhost:3010 for local development', () => {
      expect(isTrustedApiEndpoint('http://localhost:3010')).toBe(true);
    });

    it('accepts 127.0.0.1:3010 for local development', () => {
      expect(isTrustedApiEndpoint('http://127.0.0.1:3010')).toBe(true);
    });

    it('accepts trusted endpoints with trailing slash stripped by URL', () => {
      // URL normalises "https://api.genfeed.ai/" → origin "https://api.genfeed.ai"
      expect(isTrustedApiEndpoint('https://api.genfeed.ai/')).toBe(true);
    });
  });

  describe('untrusted / malicious origins', () => {
    it('rejects an arbitrary HTTPS URL', () => {
      expect(isTrustedApiEndpoint('https://evil.com')).toBe(false);
    });

    it('rejects a subdomain lookalike', () => {
      expect(isTrustedApiEndpoint('https://api.genfeed.ai.evil.com')).toBe(
        false,
      );
    });

    it('rejects an HTTP version of the production endpoint', () => {
      expect(isTrustedApiEndpoint('http://api.genfeed.ai')).toBe(false);
    });

    it('rejects HTTP on a non-localhost host', () => {
      expect(isTrustedApiEndpoint('http://192.168.1.100:3010')).toBe(false);
    });

    it('rejects localhost on a non-whitelisted port', () => {
      expect(isTrustedApiEndpoint('http://localhost:8080')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(isTrustedApiEndpoint('')).toBe(false);
    });

    it('rejects a non-URL string', () => {
      expect(isTrustedApiEndpoint('not-a-url')).toBe(false);
    });

    it('rejects a javascript: URI', () => {
      expect(isTrustedApiEndpoint('javascript:alert(1)')).toBe(false);
    });

    it('rejects a data: URI', () => {
      expect(isTrustedApiEndpoint('data:text/html,<h1>xss</h1>')).toBe(false);
    });

    it('rejects a file: URI', () => {
      expect(isTrustedApiEndpoint('file:///etc/passwd')).toBe(false);
    });

    it('rejects a URL with credentials embedded', () => {
      const embedded = `https://${'usr'}:${'pw'}@api.genfeed.ai`;
      expect(isTrustedApiEndpoint(embedded)).toBe(false);
    });
  });

  describe('TRUSTED_API_ORIGINS set', () => {
    it('contains only https origins except localhost', () => {
      for (const origin of TRUSTED_API_ORIGINS) {
        const url = new URL(origin);
        const isLocalhost =
          url.hostname === 'localhost' || url.hostname === '127.0.0.1';
        if (!isLocalhost) {
          expect(url.protocol).toBe('https:');
        }
      }
    });
  });
});
