import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function importEnvironmentService(environment = 'development') {
  vi.resetModules();
  process.env = { ...originalEnv, PLASMO_PUBLIC_ENV: environment };
  delete process.env.PLASMO_PUBLIC_APP_ENDPOINT;
  delete process.env.PLASMO_PUBLIC_ASSETS_ENDPOINT;
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

    expect(environment.appDomain).toBe('https://app.genfeed.localhost');
    expect(environment.cdnEndpoint).toBe('https://api.genfeed.localhost');
    expect(environment.ingredientsEndpoint).toBe(
      'https://api.genfeed.localhost/ingredients',
    );
    expect(environment.websiteDomain).toBe('https://website.genfeed.localhost');
    expect(environment.cookieDomain).toBe('app.genfeed.localhost');
  });

  it('uses the canonical CDN for production ingredients', async () => {
    const environment = await importEnvironmentService('production');

    expect(environment.cdnEndpoint).toBe('https://cdn.genfeed.ai');
    expect(environment.ingredientsEndpoint).toBe(
      'https://cdn.genfeed.ai/ingredients',
    );
  });

  it('serves brand assets from the canonical CDN, not the dead assets host', async () => {
    const environment = await importEnvironmentService('production');

    // `assets.genfeed.ai` does not exist — every request to it 404s, which
    // left the popup header and the injected dropdown button with a broken
    // image. Brand assets live under `cdn.genfeed.ai/assets/**`.
    expect(environment.assetsEndpoint).toBe('https://cdn.genfeed.ai/assets');
    expect(environment.assetsEndpoint).not.toContain('assets.genfeed.ai');
    expect(environment.logoURL).toBe(
      'https://cdn.genfeed.ai/assets/branding/logo.svg',
    );
    expect(environment.logoWhiteURL).toBe(
      'https://cdn.genfeed.ai/assets/branding/logo-white.png',
    );
  });

  it('honours a configured assets endpoint for the derived logo URLs', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      PLASMO_PUBLIC_ASSETS_ENDPOINT: 'https://staging-cdn.genfeed.ai/assets',
      PLASMO_PUBLIC_ENV: 'development',
    };

    const environment = await import('../src/services/environment.service');

    expect(environment.logoURL).toBe(
      'https://staging-cdn.genfeed.ai/assets/branding/logo.svg',
    );
    expect(environment.logoWhiteURL).toBe(
      'https://staging-cdn.genfeed.ai/assets/branding/logo-white.png',
    );
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

  it('does not treat the retired local.genfeed.ai host as an auth origin', async () => {
    const environment = await importEnvironmentService();

    expect(environment.authCookieOrigins).not.toContain(
      'http://local.genfeed.ai:3000',
    );
    expect(
      environment.isGenfeedAuthUrl('http://local.genfeed.ai:3000/login'),
    ).toBe(false);
    expect(environment.isGenfeedAuthUrl('https://evil.example/login')).toBe(
      false,
    );
  });
});
