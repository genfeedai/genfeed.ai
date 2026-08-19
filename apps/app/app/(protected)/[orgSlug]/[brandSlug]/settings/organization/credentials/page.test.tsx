import { permanentRedirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandOrganizationCredentialsLegacyRoute from './page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  permanentRedirect: vi.fn(),
}));

describe('BrandOrganizationCredentialsLegacyRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('permanently folds the dead credentials route into brand Settings → Social', async () => {
    await BrandOrganizationCredentialsLegacyRoute({
      params: Promise.resolve({ brandSlug: 'demo', orgSlug: 'acme' }),
    });

    expect(permanentRedirect).toHaveBeenCalledWith(
      '/acme/demo/settings/social',
    );
  });
});
