import { UsersService } from '@api/collections/users/services/users.service';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AuthIdentityResolverService {
  constructor(
    private readonly usersService: UsersService,
    private readonly clerkService: ClerkService,
    private readonly loggerService: LoggerService,
  ) {}

  async resolve(user: User): Promise<{
    clerkUserId: string;
    mongoUserId: string;
    resolvedBy: 'lookup' | 'metadata';
  }> {
    const clerkUserId = user.id;
    if (!clerkUserId) {
      throw new UnauthorizedException('Missing user identity');
    }

    const publicMetadata =
      user.publicMetadata as unknown as IClerkPublicMetadata;
    if (ObjectIdUtil.isValid(publicMetadata?.user)) {
      return {
        clerkUserId,
        mongoUserId: String(publicMetadata.user),
        resolvedBy: 'metadata',
      };
    }

    const mongoUserId =
      await this.usersService.findMongoIdByClerkId(clerkUserId);
    if (!mongoUserId || !ObjectIdUtil.isValid(mongoUserId)) {
      throw new UnauthorizedException('User account not found');
    }

    this.clerkService
      .updateUserPublicMetadata(clerkUserId, { user: mongoUserId })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Unknown Clerk error';
        this.loggerService.warn(
          `Failed to repair Clerk publicMetadata.user for ${clerkUserId}: ${message}`,
          {
            clerkUserId,
            mongoUserId,
            service: 'AuthIdentityResolverService',
          },
        );
      });

    return {
      clerkUserId,
      mongoUserId,
      resolvedBy: 'lookup',
    };
  }
}
