import type { SocialInboxScope } from '@api/collections/social-inbox/services/social-inbox.types';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ReplyLength,
  ReplyTone,
  SocialConversationType,
  SocialMessageDirection,
} from '@genfeedai/contracts';
import type { SocialSuggestedReply } from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class SocialInboxSuggestedReplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly replyGenerationService: ReplyGenerationService,
  ) {}

  async suggestReply(
    scope: SocialInboxScope,
    conversationId: string,
  ): Promise<SocialSuggestedReply> {
    if (!scope.userId)
      throw new UnauthorizedException('User context is required');
    const { organizationId } = scope;
    const conversation = await this.prisma.socialConversation.findFirst({
      where: { id: conversationId, organizationId, isDeleted: false },
    });
    if (!conversation)
      throw new NotFoundException('Conversation', conversationId);
    const messages = await this.prisma.socialMessage.findMany({
      where: {
        conversationId,
        organizationId,
        brandId: conversation.brandId,
        isDeleted: false,
        status: { notIn: ['draft', 'rejected', 'failed'] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    const inbound = messages.find(
      (message) => message.direction === SocialMessageDirection.INBOUND,
    );
    if (!inbound)
      throw new BadRequestException(
        'This conversation has no message to reply to',
      );
    const draft = await this.replyGenerationService.generateReply({
      brandId: conversation.brandId ?? undefined,
      organizationId,
      userId: scope.userId,
      platform: conversation.platform,
      conversationType:
        conversation.conversationType === SocialConversationType.DM
          ? SocialConversationType.DM
          : SocialConversationType.COMMENT,
      context: [
        conversation.sourceContentTitle,
        ...[...messages]
          .reverse()
          .map((message) => `${message.direction}: ${message.body}`),
      ]
        .filter(Boolean)
        .join('\n'),
      tweetContent: inbound.body,
      tweetAuthor:
        inbound.senderName ??
        inbound.senderHandle ??
        conversation.participantName ??
        conversation.participantHandle ??
        '',
      length: ReplyLength.MEDIUM,
      tone: ReplyTone.FRIENDLY,
    });
    return { id: conversationId, draft };
  }
}
