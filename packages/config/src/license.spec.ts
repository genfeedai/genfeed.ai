import { afterEach, describe, expect, it } from 'vitest';
import { hasOrganizationBilling, isEEEnabled } from './license';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.GENFEED_CLOUD;
  delete process.env.NEXT_PUBLIC_GENFEED_CLOUD;
  delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
  delete process.env.GENFEED_LICENSE_KEY;
  delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
});

describe('isEEEnabled', () => {
  it('is false without a license key', () => {
    delete process.env.GENFEED_LICENSE_KEY;
    delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
    expect(isEEEnabled()).toBe(false);
  });

  it('is true with a server or public license key', () => {
    process.env.GENFEED_LICENSE_KEY = 'ee-key';
    expect(isEEEnabled()).toBe(true);
  });
});

describe('hasOrganizationBilling', () => {
  it('is true on SaaS even without a license key', () => {
    delete process.env.GENFEED_LICENSE_KEY;
    delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';
    delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
    expect(hasOrganizationBilling()).toBe(true);
  });

  it('is true on self-host when EE license is present', () => {
    delete process.env.GENFEED_CLOUD;
    delete process.env.NEXT_PUBLIC_GENFEED_CLOUD;
    process.env.GENFEED_LICENSE_KEY = 'ee-key';
    expect(hasOrganizationBilling()).toBe(true);
  });

  it('is false on self-host community without a license', () => {
    delete process.env.GENFEED_CLOUD;
    delete process.env.NEXT_PUBLIC_GENFEED_CLOUD;
    delete process.env.GENFEED_LICENSE_KEY;
    delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
    expect(hasOrganizationBilling()).toBe(false);
  });

  it('is false on desktop shell even when cloud flags are set', () => {
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = 'true';
    delete process.env.GENFEED_LICENSE_KEY;
    expect(hasOrganizationBilling()).toBe(false);
  });
});
