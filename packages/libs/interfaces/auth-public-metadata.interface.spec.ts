import { MemberRole } from '@genfeedai/enums';
import type { IAuthPublicMetadata } from '@libs/interfaces/auth-public-metadata.interface';

describe('IAuthPublicMetadata', () => {
  it('should allow valid metadata structure', () => {
    const metadata: IAuthPublicMetadata = {
      balance: 100.5,
      brand: 'brand_789',
      authProviderId: 'user_authProvider_123',
      isSuperAdmin: false,
      organization: 'org_456',
      role: MemberRole.OWNER,
      stripeCustomerId: 'cus_123',
      stripePriceId: 'price_789',
      stripeSubscriptionId: 'sub_456',
      stripeSubscriptionStatus: 'active',
      user: 'user_123',
    };

    expect(metadata.user).toBe('user_123');
    expect(metadata.organization).toBe('org_456');
    expect(metadata.brand).toBe('brand_789');
    expect(metadata.balance).toBe(100.5);
    expect(metadata.role).toBe(MemberRole.OWNER);
    expect(metadata.isSuperAdmin).toBe(false);
  });

  it('should allow optional fields to be undefined', () => {
    const metadata: IAuthPublicMetadata = {
      brand: 'brand_789',
      isSuperAdmin: false,
      organization: 'org_456',
      user: 'user_123',
    };

    expect(metadata.balance).toBeUndefined();
    expect(metadata.role).toBeUndefined();
    expect(metadata.stripeCustomerId).toBeUndefined();
    expect(metadata.authProviderId).toBeUndefined();
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
