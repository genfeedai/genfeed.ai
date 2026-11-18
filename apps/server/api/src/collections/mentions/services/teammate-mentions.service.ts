import {
  type BrandAccessActor,
  BrandAccessService,
} from '@api/authorization/brand-access/brand-access.service';
import { MENTION_CREATED_EVENT } from '@api/collections/mentions/constants/mention-events.constants';
import type {
  MentionCreatedEvent,
  MentionedMember,
} from '@api/collections/mentions/interfaces/mention.interface';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { ErrorCode } from '@genfeedai/contracts';
import { Traced } from '@libs/tracing/traced';
import { ForbiddenException, HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/** Machine-readable reasons a client can branch on. */
export const MENTION_NOT_ALLOWED = 'MENTION_NOT_ALLOWED';
export const MENTION_NEEDS_SHARE = 'MENTION_NEEDS_SHARE';

/**
 * Who may be mentioned (#9946). A mention stores the teammate's canonical
 * `users.id`, so every id is checked on the server: the person must be an
 * active member of the organization and reach the brand the thread or task
 * belongs to. Nothing the client sends is trusted, and a name is never stored.
 */
@Traced()
@Injectable()
export class TeammateMentionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** The ids with blanks and repeats removed, in the order they were given. */
  normalize(mentionedUserIds: readonly string[] | undefined): string[] {
    return [
      ...new Set(
        (mentionedUserIds ?? []).map((id) => id.trim()).filter(Boolean),
      ),
    ];
  }

  /**
   * The ids that cannot be mentioned: not an active member of the
   * organization, or not able to reach `brandId` (any brand when it is null).
   * An empty list means every id is mentionable.
   */
  async findUnmentionable(
    organizationId: string,
    brandId: string | null,
    mentionedUserIds: readonly string[],
  ): Promise<string[]> {
    if (mentionedUserIds.length === 0) {
      return [];
    }
    // sql-risk-audit: ignore unbounded-read -- Bounded by MAX_MENTIONS_PER_ITEM ids in one organization.
    const members = await this.prisma.member.findMany({
      select: { userId: true },
      where: scopedWhere(organizationId, {
        isActive: true,
        userId: { in: [...mentionedUserIds] },
      }),
    });
    const activeIds = new Set(members.map((member) => member.userId));

    const unmentionable: string[] = [];
    for (const userId of mentionedUserIds) {
      if (
        !activeIds.has(userId) ||
        !(await this.reachesBrand({ organizationId, userId }, brandId))
      ) {
        unmentionable.push(userId);
      }
    }
    return unmentionable;
  }

  /** Throws one clear error naming how many mentions are refused. */
  async assertMentionable(
    organizationId: string,
    brandId: string | null,
    mentionedUserIds: readonly string[],
  ): Promise<void> {
    const unmentionable = await this.findUnmentionable(
      organizationId,
      brandId,
      mentionedUserIds,
    );
    if (unmentionable.length > 0) {
      this.rejectNotAllowed(unmentionable);
    }
  }

  rejectNotAllowed(userIds: readonly string[]): never {
    return ErrorResponse.throw({
      code: ErrorCode.VALIDATION_FAILED,
      detail:
        userIds.length === 1
          ? 'That person cannot be mentioned: they are not an active member with access to this brand.'
          : `${userIds.length} people cannot be mentioned: they are not active members with access to this brand.`,
      meta: { reason: MENTION_NOT_ALLOWED, userIds: [...userIds] },
      status: HttpStatus.BAD_REQUEST,
      title: 'Mention not allowed',
      validationErrors: userIds.map(() => ({
        code: MENTION_NOT_ALLOWED,
        field: 'mentionedUserIds',
        message: 'Not an active member with access to this brand.',
      })),
    });
  }

  /**
   * The name to show for each mentioned member. Only members of the
   * organization resolve, so an id from elsewhere never leaks a name.
   */
  async resolveMembers(
    organizationId: string,
    mentionedUserIds: readonly string[],
  ): Promise<Map<string, MentionedMember>> {
    const members = new Map<string, MentionedMember>();
    if (mentionedUserIds.length === 0) {
      return members;
    }
    // sql-risk-audit: ignore unbounded-read -- Bounded by the ids of one page of messages or comments in one organization.
    const rows = await this.prisma.member.findMany({
      select: {
        user: {
          select: {
            firstName: true,
            handle: true,
            id: true,
            lastName: true,
            name: true,
          },
        },
      },
      where: scopedWhere(organizationId, {
        userId: { in: [...new Set(mentionedUserIds)] },
      }),
    });
    for (const { user } of rows) {
      const fullName = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(' ');
      members.set(user.id, {
        id: user.id,
        name: user.name?.trim() || fullName || user.handle,
      });
    }
    return members;
  }

  /**
   * Adds `mentions` (id and name) next to the stored `mentionedUserIds` of each
   * document. The names are read now, so a rename shows up on old messages.
   */
  async attachMentions<T extends { mentionedUserIds?: string[] | null }>(
    organizationId: string,
    docs: readonly T[],
  ): Promise<Array<T & { mentions: MentionedMember[] }>> {
    const members = await this.resolveMembers(
      organizationId,
      docs.flatMap((doc) => doc.mentionedUserIds ?? []),
    );
    return docs.map((doc) => ({
      ...doc,
      mentions: (doc.mentionedUserIds ?? []).flatMap((id) => {
        const member = members.get(id);
        return member ? [member] : [];
      }),
    }));
  }

  /** One event per mentioned teammate; the author is never alerted. */
  announce(
    event: Omit<MentionCreatedEvent, 'mentionedUserId'>,
    mentionedUserIds: readonly string[],
  ): void {
    for (const mentionedUserId of mentionedUserIds) {
      if (mentionedUserId === event.actorUserId) {
        continue;
      }
      this.eventEmitter.emit(MENTION_CREATED_EVENT, {
        ...event,
        mentionedUserId,
      } satisfies MentionCreatedEvent);
    }
  }

  private async reachesBrand(
    actor: BrandAccessActor,
    brandId: string | null,
  ): Promise<boolean> {
    try {
      if (brandId) {
        await this.brandAccess.assert(actor, brandId);
      } else {
        await this.brandAccess.resolve(actor);
      }
      return true;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return false;
      }
      throw error;
    }
  }
}
