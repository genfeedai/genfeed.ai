import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import type { AddAgentThreadMessageDto } from '@api/collections/agent-threads/dto/add-agent-thread-message.dto';
import type { AgentThreadAccess } from '@api/collections/agent-threads/interfaces/agent-thread-access.interface';
import { AgentThreadAccessService } from '@api/collections/agent-threads/services/agent-thread-access.service';
import { AgentThreadSharesService } from '@api/collections/agent-threads/services/agent-thread-shares.service';
import {
  MENTION_NEEDS_SHARE,
  TeammateMentionsService,
} from '@api/collections/mentions/services/teammate-mentions.service';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  AgentThreadKind,
  AgentThreadShareLevel,
  AgentThreadShareScope,
  ErrorCode,
} from '@genfeedai/contracts';
import { Traced } from '@libs/tracing/traced';
import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * @-mentions in an agent thread (#9946). A teammate can be mentioned only if
 * they are an active member who reaches the thread's brand AND can open the
 * thread. A member who reaches the brand but cannot open the thread yet is
 * offered a share at "can view": the author passes `shareMentioned` to do it in
 * the same step, otherwise the message is refused with `MENTION_NEEDS_SHARE`.
 * Nothing is written, shared or announced for a message that is refused.
 */
@Traced()
@Injectable()
export class AgentThreadMentionsService {
  constructor(
    private readonly mentions: TeammateMentionsService,
    private readonly access: AgentThreadAccessService,
    private readonly shares: AgentThreadSharesService,
  ) {}

  /**
   * Checks every mention of a message the actor is about to write and shares
   * the thread where asked. Returns the ids to store on the message.
   */
  async prepare(
    actor: BrandAccessActor,
    threadAccess: AgentThreadAccess,
    input: Pick<
      AddAgentThreadMessageDto,
      'mentionedUserIds' | 'shareMentioned'
    >,
  ): Promise<string[]> {
    const mentionedUserIds = this.mentions.normalize(input.mentionedUserIds);
    if (mentionedUserIds.length === 0) {
      return [];
    }
    const { thread } = threadAccess;
    if (thread.kind !== AgentThreadKind.THREAD) {
      throw new BadRequestException(
        'Mentions are not available in your personal assistant thread. Start a thread from it and mention teammates there.',
      );
    }

    await this.mentions.assertMentionable(
      actor.organizationId,
      thread.brandId,
      mentionedUserIds,
    );

    const needShare: string[] = [];
    for (const userId of mentionedUserIds) {
      const canOpen = await this.access.hasAccess(
        { organizationId: actor.organizationId, userId },
        thread.id,
        'view',
      );
      if (!canOpen) {
        needShare.push(userId);
      }
    }
    if (needShare.length === 0) {
      return mentionedUserIds;
    }

    if (!input.shareMentioned || !threadAccess.canManageShares) {
      await this.rejectNeedsShare(
        actor.organizationId,
        needShare,
        threadAccess,
      );
    }
    for (const targetUserId of needShare) {
      await this.shares.grant(actor, thread.id, {
        level: AgentThreadShareLevel.VIEW,
        scope: AgentThreadShareScope.MEMBER,
        targetUserId,
      });
    }
    return mentionedUserIds;
  }

  /** Alerts each mentioned teammate once the message is saved. */
  announce(
    actor: BrandAccessActor,
    threadAccess: AgentThreadAccess,
    message: { id: string },
    label: string,
    mentionedUserIds: readonly string[],
  ): void {
    this.mentions.announce(
      {
        actorUserId: actor.userId,
        brandId: threadAccess.thread.brandId,
        label,
        organizationId: actor.organizationId,
        source: { id: message.id, type: 'agent_thread' },
        threadId: threadAccess.thread.id,
      },
      mentionedUserIds,
    );
  }

  private async rejectNeedsShare(
    organizationId: string,
    userIds: readonly string[],
    threadAccess: AgentThreadAccess,
  ): Promise<never> {
    const members = await this.mentions.resolveMembers(organizationId, userIds);
    const names = userIds.map((id) => members.get(id)?.name ?? 'A teammate');
    const canShare = threadAccess.canManageShares;
    return ErrorResponse.throw({
      code: ErrorCode.CONFLICT,
      detail: canShare
        ? `${names.join(', ')} cannot open this thread yet. Share it with them at "Can view" to mention them.`
        : `${names.join(', ')} cannot open this thread yet. Ask the thread owner to share it with them first.`,
      meta: { canShare, reason: MENTION_NEEDS_SHARE, userIds: [...userIds] },
      status: HttpStatus.CONFLICT,
      title: 'Share the thread to mention them',
    });
  }
}
