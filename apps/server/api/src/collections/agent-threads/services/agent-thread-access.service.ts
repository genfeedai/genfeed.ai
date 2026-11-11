import {
  type BrandAccessActor,
  BrandAccessService,
} from '@api/authorization/brand-access/brand-access.service';
import type {
  AgentThreadAccess,
  AgentThreadAccessNeed,
  AgentThreadAccessRow,
  AgentThreadListAccessScope,
} from '@api/collections/agent-threads/interfaces/agent-thread-access.interface';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { resolveApiKeyEffectiveMemberRole } from '@api/helpers/utils/auth/api-key-role.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  AgentThreadAccessLevel,
  AgentThreadKind,
  AgentThreadOwnerFilter,
  AgentThreadShareLevel,
  AgentThreadShareScope,
  MemberRole,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { ForbiddenException, Injectable } from '@nestjs/common';

interface LiveViewer {
  brandIds: string[] | undefined;
  isAdmin: boolean;
}

/**
 * The one access check for agent threads (#9936). A thread is open to its
 * owner, or to an actor an active share nominates AND whose live role and brand
 * access still allow it. Nothing is cached: the membership, role and share rows
 * are read on every call, so removing a share, a role or a brand assignment
 * takes effect on the next request.
 *
 * Unknown, foreign, deleted, master and inaccessible threads all give the same
 * `NotFoundException`, so a denial never says which one it was.
 */
@Traced()
@Injectable()
export class AgentThreadAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
  ) {}

  /**
   * Resolves `need` on a thread for `actor`, or throws. `view` and
   * `collaborate` open the thread to its owner or a live share. `manage`
   * (create or remove shares) is the owner or an organization admin.
   */
  async assertAccess(
    actor: BrandAccessActor,
    threadId: string,
    need: AgentThreadAccessNeed,
  ): Promise<AgentThreadAccess> {
    const thread = await this.findThread(actor.organizationId, threadId);
    if (!thread) {
      throw this.denied(threadId);
    }

    if (thread.userId === actor.userId) {
      return this.accessFor(thread, AgentThreadAccessLevel.OWNER, true);
    }

    const viewer = await this.resolveLiveViewer(actor);
    if (need === 'manage' && viewer?.isAdmin) {
      return this.accessFor(thread, AgentThreadAccessLevel.OWNER, true);
    }

    const level = await this.resolveSharedLevel(actor, thread, viewer);
    if (!level) {
      throw this.denied(threadId);
    }
    if (need === 'manage') {
      throw new ForbiddenException(
        'Only the thread owner or an organization admin can change sharing.',
      );
    }
    if (
      need === 'collaborate' &&
      level !== AgentThreadAccessLevel.COLLABORATE
    ) {
      throw new ForbiddenException(
        'This thread is shared with you to view only.',
      );
    }
    return this.accessFor(thread, level, false);
  }

  /** Whether `actor` may do `need` on a thread, without throwing. */
  async hasAccess(
    actor: BrandAccessActor,
    threadId: string,
    need: AgentThreadAccessNeed,
  ): Promise<boolean> {
    try {
      await this.assertAccess(actor, threadId, need);
      return true;
    } catch (error: unknown) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * What the list needs to add shared threads for `actor`. `null` when the
   * actor is not a live member: they keep only the threads they own.
   */
  async resolveListScope(
    actor: BrandAccessActor,
  ): Promise<AgentThreadListAccessScope | null> {
    const viewer = await this.resolveLiveViewer(actor);
    return viewer
      ? {
          apiKeyId: actor.apiKeyId,
          brandIds: viewer.brandIds,
          isApiKey: actor.isApiKey,
          organizationId: actor.organizationId,
          scopes: actor.scopes,
          userId: actor.userId,
        }
      : null;
  }

  /**
   * The `where` fragment that narrows a thread list to what `owner` asks for.
   * Combine it with `AND` next to the tenant scope: it carries no tenant keys.
   */
  buildOwnerWhere(
    userId: string,
    scope: AgentThreadListAccessScope | null,
    owner: AgentThreadOwnerFilter,
  ): Prisma.AgentThreadWhereInput {
    if (owner === AgentThreadOwnerFilter.MINE) {
      return { userId };
    }
    if (!scope) {
      // Not a live member: nothing is shared with them.
      return owner === AgentThreadOwnerFilter.SHARED
        ? { id: { in: [] } }
        : { userId };
    }
    const shared = this.buildSharedWhere(userId, scope);
    return owner === AgentThreadOwnerFilter.SHARED
      ? shared
      : { OR: [{ userId }, shared] };
  }

  /**
   * How `actor` reaches each of `threads`: `owner` for their own, otherwise the
   * strongest live share. Threads they cannot reach are left out of the map.
   */
  async resolveAccessLevels(
    scope: AgentThreadListAccessScope | null,
    threads: ReadonlyArray<
      Pick<AgentThreadAccessRow, 'brandId' | 'id' | 'userId'>
    >,
  ): Promise<Map<string, AgentThreadAccessLevel>> {
    const levels = new Map<string, AgentThreadAccessLevel>();
    const notOwned: string[] = [];
    for (const thread of threads) {
      if (scope && thread.userId === scope.userId) {
        levels.set(thread.id, AgentThreadAccessLevel.OWNER);
      } else {
        notOwned.push(thread.id);
      }
    }
    if (!scope || notOwned.length === 0) {
      return levels;
    }

    const rows = await this.prisma.agentThreadShare.findMany({
      select: { level: true, threadId: true },
      where: scopedWhere(scope.organizationId, {
        OR: this.shareTargetWhere(scope.userId, scope.brandIds),
        threadId: { in: notOwned },
      }),
    });
    for (const row of rows) {
      const current = levels.get(row.threadId);
      if (current === AgentThreadAccessLevel.COLLABORATE) {
        continue;
      }
      levels.set(
        row.threadId,
        row.level === AgentThreadShareLevel.COLLABORATE
          ? AgentThreadAccessLevel.COLLABORATE
          : AgentThreadAccessLevel.VIEW,
      );
    }
    return levels;
  }

  private buildSharedWhere(
    userId: string,
    scope: AgentThreadListAccessScope,
  ): Prisma.AgentThreadWhereInput {
    return {
      // A share never widens the viewer's brand access, and never reaches a
      // master thread.
      ...(scope.brandIds === undefined
        ? {}
        : {
            OR: [{ brandId: null }, { brandId: { in: scope.brandIds } }],
          }),
      kind: AgentThreadKind.THREAD,
      shares: {
        some: {
          isDeleted: false,
          OR: this.shareTargetWhere(userId, scope.brandIds),
          organizationId: scope.organizationId,
        },
      },
      userId: { not: userId },
    };
  }

  /** The share rows that nominate this viewer. */
  private shareTargetWhere(
    userId: string,
    brandIds: string[] | undefined,
  ): Prisma.AgentThreadShareWhereInput[] {
    return [
      { scope: AgentThreadShareScope.ORGANIZATION },
      { scope: AgentThreadShareScope.MEMBER, targetUserId: userId },
      {
        scope: AgentThreadShareScope.BRAND,
        targetBrandId:
          brandIds === undefined ? { not: null } : { in: brandIds },
      },
    ];
  }

  private async resolveSharedLevel(
    actor: BrandAccessActor,
    thread: AgentThreadAccessRow,
    viewer: LiveViewer | null,
  ): Promise<AgentThreadAccessLevel | null> {
    if (!viewer || thread.kind !== AgentThreadKind.THREAD) {
      return null;
    }
    if (
      thread.brandId &&
      viewer.brandIds !== undefined &&
      !viewer.brandIds.includes(thread.brandId)
    ) {
      return null;
    }

    const shares = await this.prisma.agentThreadShare.findMany({
      select: { level: true },
      where: scopedWhere(actor.organizationId, {
        OR: this.shareTargetWhere(actor.userId, viewer.brandIds),
        threadId: thread.id,
      }),
    });
    if (shares.length === 0) {
      return null;
    }
    return shares.some(
      (share) => share.level === AgentThreadShareLevel.COLLABORATE,
    )
      ? AgentThreadAccessLevel.COLLABORATE
      : AgentThreadAccessLevel.VIEW;
  }

  /**
   * The actor's live membership, effective role and brand reach, read now. Null
   * when they are not an active member of the organization.
   */
  private async resolveLiveViewer(
    actor: BrandAccessActor,
  ): Promise<LiveViewer | null> {
    if (!actor.userId || !actor.organizationId) {
      return null;
    }
    const member = await this.prisma.member.findFirst({
      select: { role: { select: { key: true } } },
      where: {
        isActive: true,
        isDeleted: false,
        organization: { is: { isDeleted: false } },
        organizationId: actor.organizationId,
        role: { is: { isDeleted: false } },
        userId: actor.userId,
      },
    });
    const membershipRole = Object.values(MemberRole).find(
      (role) => role === member?.role?.key,
    );
    if (!membershipRole) {
      return null;
    }

    let brandIds: string[] | undefined;
    try {
      ({ brandIds } = await this.brandAccess.resolve(actor));
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return null;
      }
      throw error;
    }
    const role = resolveApiKeyEffectiveMemberRole(actor, membershipRole);
    return {
      brandIds,
      isAdmin: role === MemberRole.OWNER || role === MemberRole.ADMIN,
    };
  }

  private findThread(
    organizationId: string,
    threadId: string,
  ): Promise<AgentThreadAccessRow | null> {
    return this.prisma.agentThread.findFirst({
      select: {
        brandId: true,
        id: true,
        kind: true,
        organizationId: true,
        status: true,
        userId: true,
      },
      where: scopedWhere(organizationId, { id: threadId }),
    });
  }

  private accessFor(
    thread: AgentThreadAccessRow,
    accessLevel: AgentThreadAccessLevel,
    canManageShares: boolean,
  ): AgentThreadAccess {
    return { accessLevel, canManageShares, thread };
  }

  private denied(threadId: string): NotFoundException {
    return new NotFoundException('Thread', threadId);
  }
}
