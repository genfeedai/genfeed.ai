import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { SocialSourcesController } from '@api/collections/social-sources/controllers/social-sources.controller';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SocialSourcesController validation scope', () => {
  const sources = { validateSource: vi.fn() };
  const controller = new SocialSourcesController(sources as never, {} as never);
  const user: AuthenticatedUser = {
    id: 'user-1',
    userId: 'user-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
  };
  beforeEach(() => vi.clearAllMocks());
  it('ignores spoofed member organization and brand query IDs', () => {
    controller.validate(
      user,
      { organizationId: 'foreign', brandId: 'foreign' },
      { platform: SocialSourcePlatform.TWITTER, handle: 'creator' },
    );
    expect(sources.validateSource).toHaveBeenCalledWith('twitter', 'creator', {
      organizationId: 'org-1',
      brandId: 'brand-1',
      userId: 'user-1',
    });
  });
  it('preserves explicit superadmin override', () => {
    controller.validate(
      { ...user, isSuperAdmin: true },
      { organizationId: 'org-2', brandId: 'brand-2' },
      { platform: SocialSourcePlatform.TWITTER, handle: 'creator' },
    );
    expect(sources.validateSource).toHaveBeenCalledWith('twitter', 'creator', {
      organizationId: 'org-2',
      brandId: 'brand-2',
      userId: 'user-1',
    });
  });
  it('fails before service access when required scope is missing', () => {
    expect(() =>
      controller.validate(
        { ...user, organizationId: '' },
        {},
        { platform: SocialSourcePlatform.TWITTER, handle: 'creator' },
      ),
    ).toThrow('context are required');
    expect(sources.validateSource).not.toHaveBeenCalled();
  });
});
