import { MemberRole } from '@genfeedai/enums';
import { IClerkPublicMetadata } from '@libs/interfaces/clerk.interface';

describe('IClerkPublicMetadata', () => {
  it('should allow valid metadata structure', () => {
    const metadata: IClerkPublicMetadata = {
      balance: 100.5,
      brand: 'brand_789',
      clerkId: 'user_clerk_123',
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
    const metadata: IClerkPublicMetadata = {
      brand: 'brand_789',
      isSuperAdmin: false,
      organization: 'org_456',
      user: 'user_123',
    };

    expect(metadata.balance).toBeUndefined();
    expect(metadata.role).toBeUndefined();
    expect(metadata.stripeCustomerId).toBeUndefined();
    expect(metadata.clerkId).toBeUndefined();
  });

  it('should require mandatory fields', () => {
    const metadata: IClerkPublicMetadata = {
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
