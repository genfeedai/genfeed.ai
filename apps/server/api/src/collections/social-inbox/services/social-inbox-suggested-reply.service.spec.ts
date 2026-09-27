import { SocialInboxSuggestedReplyService } from '@api/collections/social-inbox/services/social-inbox-suggested-reply.service';
import type { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import { CONVERSATION_MESSAGE_MAX_CHARS } from '@api/services/reply-bot/reply-generation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SocialConversationType } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

function setup(platform = 'instagram', conversationType = 'dm') {
  const prisma = {
    socialConversation: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'conversation-1',
        brandId: 'brand-1',
        platform,
        conversationType,
      }),
    },
    socialMessage: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { direction: 'inbound', body: 'Can you help?', senderName: 'Taylor' },
        ]),
    },
  };
  const generation = { generateReply: vi.fn().mockResolvedValue('Of course') };
  return {
    prisma,
    generation,
    service: new SocialInboxSuggestedReplyService(
      prisma as unknown as PrismaService,
      generation as unknown as ReplyGenerationService,
    ),
  };
}

describe('Social inbox suggested reply', () => {
  it.each([
    'instagram',
    'linkedin',
    'twitter',
    'youtube',
    'tiktok',
    'facebook',
    'reddit',
    'unipile',
  ])(
    'supports %s with the conversation brand, not the current UI brand',
    async (platform) => {
      const { service, generation, prisma } = setup(platform);
      await expect(
        service.suggestReply(
          {
            organizationId: 'org-1',
            brandId: 'different-brand',
            userId: 'user-1',
          },
          'conversation-1',
        ),
      ).resolves.toEqual({ id: 'conversation-1', draft: 'Of course' });
      expect(generation.generateReply).toHaveBeenCalledWith(
        expect.objectContaining({
          platform,
          brandId: 'brand-1',
          organizationId: 'org-1',
          userId: 'user-1',
          conversationType: SocialConversationType.DM,
        }),
      );
      expect(prisma.socialMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            brandId: 'brand-1',
            isDeleted: false,
            conversationId: 'conversation-1',
          }),
        }),
      );
    },
  );
  it('bounds each body before merging the latest 20 messages in chronological order', async () => {
    const { service, generation, prisma } = setup();
    prisma.socialMessage.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        direction: 'inbound',
        senderName: 'Taylor',
        body:
          `message-${index}:` +
          'x'.repeat(CONVERSATION_MESSAGE_MAX_CHARS) +
          'OMITTED',
      })),
    );
    await service.suggestReply(
      { organizationId: 'org-1', userId: 'user-1' },
      'conversation-1',
    );
    expect(prisma.socialMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    const options = generation.generateReply.mock.calls[0][0];
    expect(options.tweetContent).toHaveLength(CONVERSATION_MESSAGE_MAX_CHARS);
    expect(options.context).not.toContain('OMITTED');
    const lines: string[] = options.context.split('\n');
    expect(lines).toHaveLength(20);
    expect(lines[0]).toContain('message-19:');
    expect(lines[19]).toContain('message-0:');
    expect(
      lines.every(
        (line) =>
          line.length === 'inbound: '.length + CONVERSATION_MESSAGE_MAX_CHARS,
      ),
    ).toBe(true);
  });

  it('distinguishes a public reply from a DM', async () => {
    const { service, generation } = setup('youtube', 'comment');
    await service.suggestReply(
      { organizationId: 'org-1', userId: 'user-1' },
      'conversation-1',
    );
    expect(generation.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationType: SocialConversationType.COMMENT,
      }),
    );
  });
  it('rejects another tenant before loading messages or invoking generation', async () => {
    const { service, prisma, generation } = setup();
    prisma.socialConversation.findFirst.mockResolvedValue(null);
    await expect(
      service.suggestReply(
        { organizationId: 'other-org', userId: 'user-1' },
        'conversation-1',
      ),
    ).rejects.toThrow();
    expect(prisma.socialConversation.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'conversation-1',
        organizationId: 'other-org',
        isDeleted: false,
      },
    });
    expect(prisma.socialMessage.findMany).not.toHaveBeenCalled();
    expect(generation.generateReply).not.toHaveBeenCalled();
  });
  it('does not generate without inbound context', async () => {
    const { service, prisma, generation } = setup();
    prisma.socialMessage.findMany.mockResolvedValue([]);
    await expect(
      service.suggestReply(
        { organizationId: 'org-1', userId: 'user-1' },
        'conversation-1',
      ),
    ).rejects.toThrow();
    expect(generation.generateReply).not.toHaveBeenCalled();
  });
});
