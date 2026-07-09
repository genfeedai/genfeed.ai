import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ContentMentionsController } from '@api/collections/posts/controllers/content-mentions.controller';

describe('ContentMentionsController', () => {
  const makeUser = (organization = 'org-1') =>
    ({
      publicMetadata: {
        brand: 'brand-1',
        organization,
        user: 'user-1',
      },
    }) as unknown as User;

  it('returns content mentions for the current organization', async () => {
    const postsService = {
      listContentMentions: vi.fn().mockResolvedValue([
        {
          contentTitle: 'Launch thread',
          contentType: 'text',
          id: 'post-1',
        },
      ]),
    };
    const controller = new ContentMentionsController(postsService as never);

    const result = await controller.getMentions(makeUser());

    expect(postsService.listContentMentions).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({
      mentions: [
        {
          contentTitle: 'Launch thread',
          contentType: 'text',
          id: 'post-1',
        },
      ],
    });
  });

  it('rejects requests missing organization metadata', async () => {
    const controller = new ContentMentionsController({
      listContentMentions: vi.fn(),
    } as never);

    await expect(controller.getMentions(makeUser(''))).rejects.toThrow(
      'Bad Request',
    );
  });
});
