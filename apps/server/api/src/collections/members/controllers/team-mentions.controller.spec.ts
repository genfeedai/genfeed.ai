import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { TeamMentionsController } from '@api/collections/members/controllers/team-mentions.controller';

describe('TeamMentionsController', () => {
  const makeUser = (organization = 'org-1') =>
    ({
      publicMetadata: {
        brand: 'brand-1',
        organization,
        user: 'user-1',
      },
    }) as unknown as User;

  it('returns mentions for the current organization', async () => {
    const membersService = {
      listTeamMentions: vi.fn().mockResolvedValue([
        {
          displayName: 'Ada Lovelace',
          id: 'member-1',
          isAgent: false,
          role: 'Admin',
        },
      ]),
    };
    const controller = new TeamMentionsController(membersService as never);

    const result = await controller.getMentions(makeUser());

    expect(membersService.listTeamMentions).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({
      mentions: [
        {
          displayName: 'Ada Lovelace',
          id: 'member-1',
          isAgent: false,
          role: 'Admin',
        },
      ],
    });
  });

  it('rejects requests missing organization metadata', async () => {
    const controller = new TeamMentionsController({
      listTeamMentions: vi.fn(),
    } as never);

    await expect(controller.getMentions(makeUser(''))).rejects.toThrow(
      'Bad Request',
    );
  });
});
