import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCoreAppFeatureFlagFallbacks } from './core-apps';

describe('getCoreAppFeatureFlagFallbacks', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults Studio off for the SaaS web app', () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', 'false');

    expect(getCoreAppFeatureFlagFallbacks()).toEqual({ studio: false });
  });

  it('keeps Studio on for the local-first Desktop app', () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', 'true');

    expect(getCoreAppFeatureFlagFallbacks()).toEqual({ studio: true });
  });

  it('keeps Studio on for self-hosted web deployments', () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', 'false');

    expect(getCoreAppFeatureFlagFallbacks()).toEqual({ studio: true });
  });
});
