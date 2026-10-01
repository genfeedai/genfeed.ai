import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ContentMentionsController } from '@api/collections/posts/controllers/content-mentions.controller';

describe('ContentMentionsController', () => {
  const makeUser = (organizationId = 'org-1') =>
    ({
      brandId: 'brand-1',
      id: 'auth-provider-1',
      organizationId,
      userId: 'user-1',
    }) as unknown as User;

  it('returns content mentions for the current organization', async () => {
    const postsService = {
      listContentMentions: vi.fn().mockResolvedValue([
        {
          brandId: 'brand-1',
          contentTitle: 'Launch thread',
          contentType: 'text',
          id: 'post-1',
        },
      ]),
    };
    const controller = new ContentMentionsController(postsService as never);

    const result = await controller.getMentions(makeUser());

    expect(postsService.listContentMentions).toHaveBeenCalledWith(
      'org-1',
      undefined,
    );
    expect(result).toEqual({
      mentions: [
        {
          brandId: 'brand-1',
          contentTitle: 'Launch thread',
          contentType: 'text',
          id: 'post-1',
        },
      ],
    });
  });

  it('forwards the requested conversation brand rather than user brand metadata', async () => {
    const listContentMentions = vi.fn().mockResolvedValue([]);
    const controller = new ContentMentionsController({
      listContentMentions,
    } as never);
    await controller.getMentions(makeUser(), 'conversation-brand');
    expect(listContentMentions).toHaveBeenCalledWith(
      'org-1',
      'conversation-brand',
    );
  });

  it('rejects requests missing organization metadata', async () => {
    const controller = new ContentMentionsController({
      listContentMentions: vi.fn(),
    } as never);

    await expect(controller.getMentions(makeUser(''))).rejects.toThrow(
      'Bad Request',
    );
  });

  it('rejects a repeated brandId before querying', async () => {
    const listContentMentions = vi.fn().mockResolvedValue([]);
    const controller = new ContentMentionsController({
      listContentMentions,
    } as never);

    await expect(
      controller.getMentions(makeUser(), ['brand-1', 'brand-2'] as never),
    ).rejects.toThrow('Bad Request');
    expect(listContentMentions).not.toHaveBeenCalled();
  });
});
