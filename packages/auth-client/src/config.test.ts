import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BETTER_AUTH_BASE_PATH,
  getApiEndpoint,
  getApiOrigin,
  isBetterAuthEnabled,
} from './config';

describe('auth-client config', () => {
  const originalEnabled = process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
  const originalEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT;

  beforeEach(() => {
    // Note: `process.env.X = undefined` coerces to the string "undefined" (a
    // truthy value) — delete the keys so the defaults are actually exercised.
    delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    delete process.env.NEXT_PUBLIC_API_ENDPOINT;
  });

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = originalEnabled;
    }
    if (originalEndpoint === undefined) {
      delete process.env.NEXT_PUBLIC_API_ENDPOINT;
    } else {
      process.env.NEXT_PUBLIC_API_ENDPOINT = originalEndpoint;
    }
  });

  it('carries the full /v1/auth prefix (basePath, not baseURL)', () => {
    // Critical: Better Auth drops basePath when baseURL already has a path, so
    // the whole prefix must live here and baseURL must be the bare origin.
    expect(BETTER_AUTH_BASE_PATH).toBe('/v1/auth');
  });

  describe('getApiOrigin', () => {
    it('strips the /v1 path to a bare origin (default)', () => {
      expect(getApiOrigin()).toBe('https://api.genfeed.ai');
    });

    it('strips the path from a custom endpoint', () => {
      process.env.NEXT_PUBLIC_API_ENDPOINT = 'http://local.genfeed.ai:3010/v1';
      expect(getApiOrigin()).toBe('http://local.genfeed.ai:3010');
    });

    it('produces the correct effective auth base URL', () => {
      // This is exactly what the client/server concatenate before hitting the
      // Phase 1 handler — guards against the basePath-drop bug.
      expect(`${getApiOrigin()}${BETTER_AUTH_BASE_PATH}`).toBe(
        'https://api.genfeed.ai/v1/auth',
      );
    });
  });

  describe('isBetterAuthEnabled', () => {
    it('is false by default (dual-run off — Clerk stays default)', () => {
      expect(isBetterAuthEnabled()).toBe(false);
    });

    it('is true only for the exact string "true"', () => {
      process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = 'true';
      expect(isBetterAuthEnabled()).toBe(true);
    });

    it('is false for any non-"true" value', () => {
      process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED = '1';
      expect(isBetterAuthEnabled()).toBe(false);
    });
  });

  describe('getApiEndpoint', () => {
    it('falls back to the production API origin when unset', () => {
      expect(getApiEndpoint()).toBe('https://api.genfeed.ai/v1');
    });

    it('honours NEXT_PUBLIC_API_ENDPOINT when present', () => {
      process.env.NEXT_PUBLIC_API_ENDPOINT = 'http://local.genfeed.ai:3010/v1';
      expect(getApiEndpoint()).toBe('http://local.genfeed.ai:3010/v1');
    });
  });
});
