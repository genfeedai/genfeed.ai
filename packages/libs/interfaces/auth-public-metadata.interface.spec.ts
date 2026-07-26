import type { IAuthPublicMetadata } from '@libs/interfaces/auth-public-metadata.interface';

describe('IAuthPublicMetadata', () => {
  it('should allow valid metadata structure', () => {
    const metadata: IAuthPublicMetadata = {
      brand: 'brand_789',
      isSuperAdmin: false,
      organization: 'org_456',
      stripeSubscriptionId: 'sub_456',
      stripeSubscriptionStatus: 'active',
      user: 'user_123',
    };

    expect(metadata.user).toBe('user_123');
    expect(metadata.organization).toBe('org_456');
    expect(metadata.brand).toBe('brand_789');
    expect(metadata.stripeSubscriptionId).toBe('sub_456');
    expect(metadata.isSuperAdmin).toBe(false);
  });

  it('should allow optional fields to be undefined', () => {
    const metadata: IAuthPublicMetadata = {
      brand: 'brand_789',
      isSuperAdmin: false,
      organization: 'org_456',
      user: 'user_123',
    };

    expect(metadata.apiKeyId).toBeUndefined();
    expect(metadata.scopes).toBeUndefined();
    expect(metadata.stripeSubscriptionId).toBeUndefined();
  });

  it('should require mandatory fields', () => {
    const metadata: IAuthPublicMetadata = {
      brand: 'brand_789',
      isSuperAdmin: true,
      organization: 'org_456',
      user: 'user_123',
    };

    expect(metadata.user).toBeDefined();
    expect(metadata.organization).toBeDefined();
    expect(metadata.brand).toBeDefined();
    expect(metadata.isSuperAdmin).toBeDefined();
  });
});
