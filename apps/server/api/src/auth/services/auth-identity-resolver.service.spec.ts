import { AuthIdentityResolverService } from '@api/auth/services/auth-identity-resolver.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { LoggerService } from '@libs/logger/logger.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthIdentityResolverService', () => {
  const usersService = {
    findMongoIdByClerkId: vi.fn(),
  };
  const clerkService = {
    updateUserPublicMetadata: vi.fn(),
  };
  const loggerService = {
    warn: vi.fn(),
  };

  const service = new AuthIdentityResolverService(
    usersService as unknown as UsersService,
    clerkService as unknown as ClerkService,
    loggerService as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses metadata user id when valid', async () => {
    const result = await service.resolve({
      id: 'user_clerk_1',
      publicMetadata: {
        user: '507f1f77bcf86cd799439011',
      },
    } as never);

    expect(result).toEqual({
      clerkUserId: 'user_clerk_1',
      mongoUserId: '507f1f77bcf86cd799439011',
      resolvedBy: 'metadata',
    });
    expect(usersService.findMongoIdByClerkId).not.toHaveBeenCalled();
    expect(clerkService.updateUserPublicMetadata).not.toHaveBeenCalled();
  });

  it('falls back to users lookup and repairs metadata', async () => {
    usersService.findMongoIdByClerkId.mockResolvedValue(
      '507f1f77bcf86cd799439012',
    );
    clerkService.updateUserPublicMetadata.mockResolvedValue(undefined);

    const result = await service.resolve({
      id: 'user_clerk_2',
      publicMetadata: {
        user: 'not-an-object-id',
      },
    } as never);

    expect(result).toEqual({
      clerkUserId: 'user_clerk_2',
      mongoUserId: '507f1f77bcf86cd799439012',
      resolvedBy: 'lookup',
    });
    expect(usersService.findMongoIdByClerkId).toHaveBeenCalledWith(
      'user_clerk_2',
    );
    expect(clerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
      'user_clerk_2',
      { user: '507f1f77bcf86cd799439012' },
    );
  });

  it('throws when lookup cannot resolve mongo user id', async () => {
    usersService.findMongoIdByClerkId.mockResolvedValue(null);

    await expect(
      service.resolve({
        id: 'user_clerk_missing',
        publicMetadata: {},
      } as never),
    ).rejects.toThrow(UnauthorizedException);
  });
});
