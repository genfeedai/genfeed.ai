import { CacheService } from '@api/services/cache/services/cache.service';
import { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { ClerkClient, User } from '@clerk/backend';
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

type CreateUserParams = Parameters<ClerkClient['users']['createUser']>[0];

const CLERK_USER_CACHE_NAMESPACE = 'clerk-user';
const CLERK_USER_CACHE_TTL_SECONDS = 60;

interface GetClerkUserOptions {
  skipCache?: boolean;
}

@Injectable()
export class ClerkService {
  constructor(
    @Inject('ClerkClient')
    private readonly clerkClient: ClerkClient | null,
    private readonly cacheService: CacheService,
  ) {}

  private getClient(): ClerkClient {
    if (!this.clerkClient) {
      throw new ServiceUnavailableException(
        'Clerk is not configured for this deployment mode',
      );
    }

    return this.clerkClient;
  }

  private buildUserCacheKey(userId: string): string {
    return this.cacheService.generateKey(CLERK_USER_CACHE_NAMESPACE, userId);
  }

  private buildUserCacheTags(userId: string): string[] {
    return ['clerk-users', `clerk-user:${userId}`];
  }

  private async invalidateUserCache(userId: string): Promise<void> {
    await this.cacheService.invalidateByTags(this.buildUserCacheTags(userId));
  }

  private async fetchUser(userId: string): Promise<User> {
    return await this.getClient().users.getUser(userId);
  }

  public async getUser(
    userId: string,
    options: GetClerkUserOptions = {},
  ): Promise<User> {
    if (options.skipCache) {
      return await this.fetchUser(userId);
    }

    const cacheKey = this.buildUserCacheKey(userId);
    const cachedUser = await this.cacheService.get<User>(cacheKey);

    if (cachedUser) {
      return cachedUser;
    }

    const user = await this.fetchUser(userId);

    await this.cacheService.set(cacheKey, user, {
      tags: this.buildUserCacheTags(userId),
      ttl: CLERK_USER_CACHE_TTL_SECONDS,
    });

    return user;
  }

  public async getUserByEmail(email: string) {
    const users = await this.getClient().users.getUserList({
      emailAddress: [email],
    });
    return users.data[0] || null;
  }

  public async createUser(params: CreateUserParams): Promise<User> {
    return await this.getClient().users.createUser(params);
  }

  public async updateUser(
    userId: string,
    attrs: Partial<IClerkPublicMetadata>,
  ) {
    const updatedUser = await this.getClient().users.updateUser(userId, attrs);
    await this.invalidateUserCache(userId);
    return updatedUser;
  }

  public async updateUserPrivateMetadata(
    userId: string,
    attrs: Partial<IClerkPublicMetadata>,
  ) {
    const updatedUser = await this.getClient().users.updateUserMetadata(
      userId,
      {
        privateMetadata: {
          ...attrs,
        },
      },
    );
    await this.invalidateUserCache(userId);
    return updatedUser;
  }

  public async updateUserPublicMetadata(
    clerkUserId: string,
    attrs: Partial<IClerkPublicMetadata>,
  ) {
    // First get the current user to preserve existing metadata
    const currentUser = await this.fetchUser(clerkUserId);
    const existingMetadata = currentUser.publicMetadata || {};
    const nextMetadata = {
      ...existingMetadata,
      ...attrs,
    } as Record<string, unknown>;

    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined) {
        delete nextMetadata[key];
      }
    }

    const updatedUser = await this.getClient().users.updateUserMetadata(
      clerkUserId,
      {
        publicMetadata: nextMetadata,
      },
    );

    await this.invalidateUserCache(clerkUserId);

    return updatedUser;
  }

  public async createInvitation(
    emailAddress: string,
    redirectUrl?: string,
    publicMetadata?: Record<string, unknown>,
  ) {
    return await this.getClient().invitations.createInvitation({
      emailAddress,
      publicMetadata,
      redirectUrl,
    });
  }

  public async listInvitations(status?: 'pending' | 'accepted' | 'revoked') {
    const result = await this.getClient().invitations.getInvitationList({
      ...(status && { status }),
    });
    return result.data;
  }

  public async getInvitation(invitationId: string) {
    try {
      const result = await this.getClient().invitations.getInvitationList({
        limit: 1,
        query: invitationId,
      });
      return (
        result.data.find((invitation) => invitation.id === invitationId) ?? null
      );
    } catch {
      return null;
    }
  }

  public async revokeInvitation(invitationId: string) {
    return await this.getClient().invitations.revokeInvitation(invitationId);
  }
}
