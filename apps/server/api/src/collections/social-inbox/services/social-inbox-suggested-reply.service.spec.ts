import { SocialInboxSuggestedReplyService } from '@api/collections/social-inbox/services/social-inbox-suggested-reply.service';
import type { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
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
