import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import type { User } from '@clerk/backend';

describe('getPublicMetadata', () => {
  it('returns typed public metadata', () => {
    const user = {
      publicMetadata: {
        brand: '3',
        isSuperAdmin: false,
        organization: '2',
        user: '1',
      },
    } as unknown as User;
    const metadata = getPublicMetadata(user);
    expect(metadata.user).toBe('1');
    expect(metadata.organization).toBe('2');
    expect(metadata.brand).toBe('3');
    expect(metadata.isSuperAdmin).toBe(false);
  });
});
