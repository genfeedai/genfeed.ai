import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { CreateAgentThreadShareDto } from '@api/collections/agent-threads/dto/create-agent-thread-share.dto';
import { AgentThreadAccessService } from '@api/collections/agent-threads/services/agent-thread-access.service';
import { AgentThreadAudienceService } from '@api/collections/agent-threads/services/agent-thread-audience.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { AgentThreadKind, AgentThreadShareScope } from '@genfeedai/contracts';
import type { AgentThreadShare } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Creates, lists and removes thread shares (#9936). Only the thread owner and
 * organization admins may; every row carries the organization, and a removed
 * share is a soft delete the access check stops honoring on the next request.
 */
@Traced()
@Injectable()
export class AgentThreadSharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AgentThreadAccessService,
    private readonly brandAccess: BrandAccessService,
    private readonly audience: AgentThreadAudienceService,
  ) {}

  async list(
    actor: BrandAccessActor,
    threadId: string,
  ): Promise<AgentThreadShare[]> {
    await this.access.assertAccess(actor, threadId, 'manage');
    // sql-risk-audit: ignore unbounded-read -- One thread in one organization; a thread holds at most one live share per target.
    return this.prisma.agentThreadShare.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      where: scopedWhere(actor.organizationId, { threadId }),
    });
  }

  /** Shares the thread with a target, or changes the level of a live share. */
  async grant(
    actor: BrandAccessActor,
    threadId: string,
    input: CreateAgentThreadShareDto,
  ): Promise<AgentThreadShare> {
    const { thread } = await this.access.assertAccess(
      actor,
      threadId,
      'manage',
    );
    if (thread.kind === AgentThreadKind.MASTER) {
      throw new BadRequestException(
        'A master thread cannot be shared. Start a thread from it and share that one.',
      );
    }

    const target = await this.resolveTarget(actor, thread, input);
    const targetKey = {
      scope: input.scope,
      targetBrandId: target.targetBrandId,
      targetUserId: target.targetUserId,
      threadId,
    };
    const data = { grantedByUserId: actor.userId, level: input.level };

    const updated = await this.prisma.agentThreadShare.updateMany({
      data,
      where: scopedWhere(actor.organizationId, targetKey),
    });
    if (updated.count === 0) {
      try {
        return await this.prisma.agentThreadShare.create({
          data: {
            ...data,
            organizationId: actor.organizationId,
            scope: input.scope,
            targetBrandId: target.targetBrandId,
            targetUserId: target.targetUserId,
            threadId,
          },
        });
      } catch (error: unknown) {
        // A concurrent grant to the same target won the unique index: update it.
        if ((error as { code?: unknown } | null)?.code !== 'P2002') {
          throw error;
        }
        await this.prisma.agentThreadShare.updateMany({
          data,
          where: scopedWhere(actor.organizationId, targetKey),
        });
      }
    }

    const share = await this.prisma.agentThreadShare.findFirst({
      where: scopedWhere(actor.organizationId, targetKey),
    });
    if (!share) {
      throw new NotFoundException('Thread share');
    }
    // The new member starts receiving the thread's live events at once.
    await this.audience.refresh(threadId);
    return share;
  }

  async revoke(
    actor: BrandAccessActor,
    threadId: string,
    shareId: string,
  ): Promise<void> {
    await this.access.assertAccess(actor, threadId, 'manage');
    // Read before the removal: the process that streams the thread may be
    // another one, so the members who lose access are the difference.
    const before = await this.audience.refresh(threadId);
    const removed = await this.prisma.agentThreadShare.updateMany({
      data: { isDeleted: true },
      where: scopedWhere(actor.organizationId, { id: shareId, threadId }),
    });
    if (removed.count !== 1) {
      throw new NotFoundException('Thread share', shareId);
    }
    // Members who no longer reach the thread are told, and stop receiving its
    // live events from the next one.
    await this.audience.refresh(threadId, before);
  }

  private async resolveTarget(
    actor: BrandAccessActor,
    thread: { brandId: string | null; userId: string },
    input: CreateAgentThreadShareDto,
  ): Promise<{ targetBrandId: string | null; targetUserId: string | null }> {
    if (input.scope === AgentThreadShareScope.ORGANIZATION) {
      if (input.targetUserId || input.targetBrandId) {
        throw new BadRequestException(
          'An organization share takes no member or brand.',
        );
      }
      return { targetBrandId: null, targetUserId: null };
    }

    if (input.scope === AgentThreadShareScope.MEMBER) {
      if (!input.targetUserId || input.targetBrandId) {
        throw new BadRequestException('A member share names one member.');
      }
      if (input.targetUserId === thread.userId) {
        throw new BadRequestException('The owner already has this thread.');
      }
      const member = await this.prisma.member.findFirst({
        select: { id: true },
        where: {
          isActive: true,
          isDeleted: false,
          organizationId: actor.organizationId,
          userId: input.targetUserId,
        },
      });
      if (!member) {
        throw new BadRequestException(
          'That person is not an active member of this organization.',
        );
      }
      return { targetBrandId: null, targetUserId: input.targetUserId };
    }

    if (!input.targetBrandId && !thread.brandId) {
      throw new BadRequestException('A brand share names a brand.');
    }
    if (input.targetUserId) {
      throw new BadRequestException('A brand share takes no member.');
    }
    const targetBrandId = input.targetBrandId ?? thread.brandId;
    if (!targetBrandId) {
      throw new BadRequestException('A brand share names a brand.');
    }
    if (thread.brandId && targetBrandId !== thread.brandId) {
      throw new BadRequestException(
        'A thread in a brand can only be shared with that brand.',
      );
    }
    await this.brandAccess.assert(actor, targetBrandId);
    return { targetBrandId, targetUserId: null };
  }
}
