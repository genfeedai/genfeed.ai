import { AuthIdentityResolverService } from '@api/auth/services/auth-identity-resolver.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { LoggerService } from '@libs/logger/logger.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthIdentityResolverService', () => {
  const usersService = {
    findOne: vi.fn(),
  };
  const organizationsService = {
    findOne: vi.fn(),
  };
  const brandsService = {
    findOne: vi.fn(),
  };
  const membersService = {
    find: vi.fn(),
  };
  const clerkService = {
    updateUserPublicMetadata: vi.fn(),
  };
  const loggerService = {
    warn: vi.fn(),
  };

  const service = new AuthIdentityResolverService(
    usersService as unknown as UsersService,
    organizationsService as unknown as OrganizationsService,
    brandsService as unknown as BrandsService,
    membersService as unknown as MembersService,
    clerkService as unknown as ClerkService,
    loggerService as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses current metadata ids without repairing Clerk metadata', async () => {
    usersService.findOne.mockResolvedValueOnce({
      _id: 'user_current',
    });
    membersService.find.mockResolvedValue([
      {
        lastUsedBrandId: 'brand_current',
        organizationId: 'org_current',
      },
    ]);
    organizationsService.findOne.mockResolvedValueOnce({
      _id: 'org_current',
      userId: 'user_current',
    });
    brandsService.findOne.mockResolvedValueOnce({
      _id: 'brand_current',
    });

    const result = await service.resolve({
      id: 'user_clerk_1',
      publicMetadata: {
        brand: 'brand_current',
        organization: 'org_current',
        user: 'user_current',
      },
    } as never);

    expect(result).toEqual({
      brandId: 'brand_current',
      clerkUserId: 'user_clerk_1',
      organizationId: 'org_current',
      resolvedBy: 'metadata',
      userId: 'user_current',
    });
    expect(clerkService.updateUserPublicMetadata).not.toHaveBeenCalled();
  });

  it('resolves legacy metadata via mongoId fields and repairs Clerk metadata', async () => {
    usersService.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      _id: 'user_current',
    });
    membersService.find.mockResolvedValue([
      {
        lastUsedBrandId: 'brand_current',
        organizationId: 'org_current',
      },
    ]);
    organizationsService.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: 'org_current',
        userId: 'user_current',
      });
    brandsService.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      _id: 'brand_current',
    });
    clerkService.updateUserPublicMetadata.mockResolvedValue(undefined);

    const result = await service.resolve({
      id: 'user_clerk_2',
      publicMetadata: {
        brand: '507f1f77bcf86cd799439013',
        organization: '507f1f77bcf86cd799439012',
        user: '507f1f77bcf86cd799439011',
      },
    } as never);

    expect(result).toEqual({
      brandId: 'brand_current',
      clerkUserId: 'user_clerk_2',
      organizationId: 'org_current',
      resolvedBy: 'metadata',
      userId: 'user_current',
    });
    expect(clerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
      'user_clerk_2',
      {
        brand: 'brand_current',
        organization: 'org_current',
        user: 'user_current',
      },
    );
  });

  it('throws when lookup cannot resolve current user id', async () => {
    usersService.findOne.mockResolvedValue(null);

    await expect(
      service.resolve({
        id: 'user_clerk_missing',
        publicMetadata: {},
      } as never),
    ).rejects.toThrow(UnauthorizedException);
  });
});
