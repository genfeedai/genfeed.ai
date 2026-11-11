import {
  type BrandAccessActor,
  BrandAccessService,
} from '@api/authorization/brand-access/brand-access.service';
import type {
  AgentThreadAccess,
  AgentThreadAccessNeed,
  AgentThreadAccessRow,
  AgentThreadListAccess,
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

    const isOwner = thread.userId === actor.userId;
    // A key limited to some brands (#9130) reaches only those, owner or not.
    const viewer =
      isOwner && !actor.isApiKey ? null : await this.resolveLiveViewer(actor);
    if (isOwner) {
      if (actor.isApiKey && (!viewer || !this.hasBrandReach(viewer, thread))) {
        throw this.denied(threadId);
      }
      return this.accessFor(thread, AgentThreadAccessLevel.OWNER, true);
    }

    // A master thread belongs to its owner alone, admins included.
    if (thread.kind !== AgentThreadKind.THREAD) {
      throw this.denied(threadId);
    }
    if (
      need === 'manage' &&
      viewer?.isAdmin &&
      // A brand-limited key manages no thread outside its brands, personal
      // (brandless) threads included.
      (viewer.brandIds === undefined || this.hasBrandReach(viewer, thread)) &&
      (viewer.brandIds === undefined || thread.brandId !== null)
    ) {
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
    return this.accessFor(thread, level, viewer?.isAdmin === true);
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
          isAdmin: viewer.isAdmin,
          isApiKey: actor.isApiKey,
          organizationId: actor.organizationId,
          scopes: actor.scopes,
          userId: actor.userId,
        }
      : null;
  }

  /** The owner filter a thread list asks for, narrowed to what `actor` may see. */
  async resolveListAccess(
    actor: BrandAccessActor,
    owner?: string,
  ): Promise<AgentThreadListAccess> {
    const filter = Object.values(AgentThreadOwnerFilter).find(
      (value) => value === owner,
    );
    const scope = await this.resolveListScope(actor);
    return {
      ownerWhere: this.buildOwnerWhere(
        actor.userId,
        scope,
        filter ?? AgentThreadOwnerFilter.ALL,
      ),
      scope,
      userId: actor.userId,
    };
  }

  /**
   * Adds how `access` reaches each thread of a listed page, and, for the threads
   * the viewer manages, who they are shared with.
   */
  async attachAccessLevels<
    T extends Pick<AgentThreadAccessRow, 'brandId' | 'id' | 'userId'>,
  >(
    access: AgentThreadListAccess,
    page: { docs: T[] },
  ): Promise<{
    docs: Array<
      T & {
        accessLevel?: AgentThreadAccessLevel;
        canManageShares: boolean;
        shareCount?: number;
        shareScope?: AgentThreadShareScope;
      }
    >;
  }> {
    const levels = await this.resolveAccessLevels(
      access.userId,
      access.scope,
      page.docs,
    );
    const rows = page.docs.map((doc) => {
      const accessLevel = levels.get(doc.id);
      const isOwner = accessLevel === AgentThreadAccessLevel.OWNER;
      // Same rule as `assertAccess(..., 'manage')`: the owner, or a live
      // admin; a brand-limited key manages no brandless thread it does not own.
      const isManagedByAdmin =
        accessLevel !== undefined &&
        access.scope?.isAdmin === true &&
        (access.scope.brandIds === undefined || doc.brandId !== null);
      return {
        ...doc,
        accessLevel,
        canManageShares: isOwner || isManagedByAdmin,
      };
    });
    const summaries = await this.summarizeShares(
      access.scope,
      rows.filter((row) => row.canManageShares).map((row) => row.id),
    );
    return {
      ...page,
      docs: rows.map((row) => ({ ...row, ...summaries.get(row.id) })),
    };
  }

  /**
   * Who each of `threadIds` is shared with: the widest scope a live share
   * reaches (organization over brand over people) and how many shares there
   * are. A thread nobody can open but its owner is left out.
   */
  private async summarizeShares(
    scope: AgentThreadListAccessScope | null,
    threadIds: string[],
  ): Promise<
    Map<string, { shareCount: number; shareScope: AgentThreadShareScope }>
  > {
    const summaries = new Map<
      string,
      { shareCount: number; shareScope: AgentThreadShareScope }
    >();
    if (!scope || threadIds.length === 0) {
      return summaries;
    }
    // sql-risk-audit: ignore unbounded-read -- Bounded by the caller's page of thread ids and one organization.
    const rows = await this.prisma.agentThreadShare.findMany({
      select: { scope: true, threadId: true },
      where: scopedWhere(scope.organizationId, {
        threadId: { in: threadIds },
      }),
    });
    const rank = [
      AgentThreadShareScope.MEMBER,
      AgentThreadShareScope.BRAND,
      AgentThreadShareScope.ORGANIZATION,
    ];
    for (const row of rows) {
      const shareScope = rank.find((value) => value === row.scope);
      if (!shareScope) {
        continue;
      }
      const current = summaries.get(row.threadId);
      summaries.set(row.threadId, {
        shareCount: (current?.shareCount ?? 0) + 1,
        shareScope:
          current && rank.indexOf(current.shareScope) > rank.indexOf(shareScope)
            ? current.shareScope
            : shareScope,
      });
    }
    return summaries;
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
    userId: string,
    scope: AgentThreadListAccessScope | null,
    threads: ReadonlyArray<
      Pick<AgentThreadAccessRow, 'brandId' | 'id' | 'userId'>
    >,
  ): Promise<Map<string, AgentThreadAccessLevel>> {
    const levels = new Map<string, AgentThreadAccessLevel>();
    const notOwned: string[] = [];
    for (const thread of threads) {
      if (thread.userId === userId) {
        levels.set(thread.id, AgentThreadAccessLevel.OWNER);
      } else {
        notOwned.push(thread.id);
      }
    }
    if (!scope || notOwned.length === 0) {
      return levels;
    }

    // sql-risk-audit: ignore unbounded-read -- Bounded by the caller's page of thread ids and one organization; a thread holds at most one live share per target.
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

  /** A brand-limited viewer (an API key with an allowlist) reaches only those brands' threads. */
  private hasBrandReach(
    viewer: LiveViewer,
    thread: AgentThreadAccessRow,
  ): boolean {
    return (
      !thread.brandId ||
      viewer.brandIds === undefined ||
      viewer.brandIds.includes(thread.brandId)
    );
  }

  private async resolveSharedLevel(
    actor: BrandAccessActor,
    thread: AgentThreadAccessRow,
    viewer: LiveViewer | null,
  ): Promise<AgentThreadAccessLevel | null> {
    if (!viewer || thread.kind !== AgentThreadKind.THREAD) {
      return null;
    }
    if (!this.hasBrandReach(viewer, thread)) {
      return null;
    }

    // sql-risk-audit: ignore unbounded-read -- One thread in one organization; a thread holds at most one live share per target.
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
    let liveRole: MemberRole | null = null;
    try {
      ({ brandIds, role: liveRole } = await this.brandAccess.resolve(actor));
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return null;
      }
      throw error;
    }
    const role =
      liveRole ?? resolveApiKeyEffectiveMemberRole(actor, membershipRole);
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
