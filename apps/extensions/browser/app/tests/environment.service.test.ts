import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function importEnvironmentService(environment = 'development') {
  vi.resetModules();
  process.env = { ...originalEnv, PLASMO_PUBLIC_ENV: environment };
  delete process.env.PLASMO_PUBLIC_APP_ENDPOINT;
  delete process.env.PLASMO_PUBLIC_WEBSITE_ENDPOINT;

  return import('../src/services/environment.service');
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('browser extension environment service', () => {
  it('uses genfeed.localhost for development app and website defaults', async () => {
    const environment = await importEnvironmentService();

    expect(environment.appDomain).toBe('http://genfeed.localhost:3000');
    expect(environment.websiteDomain).toBe('http://genfeed.localhost:3002');
    expect(environment.cookieDomain).toBe('genfeed.localhost');
  });

  it('derives auth matching and cookies from the configured app endpoint', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      PLASMO_PUBLIC_APP_ENDPOINT: 'http://custom.genfeed.localhost:3200',
      PLASMO_PUBLIC_ENV: 'development',
    };

    const environment = await import('../src/services/environment.service');

    expect(environment.cookieDomain).toBe('custom.genfeed.localhost');
    expect(
      environment.isGenfeedAuthUrl(
        'http://custom.genfeed.localhost:3200/onboarding',
      ),
    ).toBe(true);
  });

  it('keeps the legacy development host as an explicit compatibility allowlist entry', async () => {
    const environment = await importEnvironmentService();

    expect(environment.authCookieOrigins).toContain(
      'http://local.genfeed.ai:3000',
    );
    expect(
      environment.isGenfeedAuthUrl('http://local.genfeed.ai:3000/login'),
    ).toBe(true);
    expect(environment.isGenfeedAuthUrl('https://evil.example/login')).toBe(
      false,
    );
  });
});
