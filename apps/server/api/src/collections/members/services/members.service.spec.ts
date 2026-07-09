import { MembersService } from '@api/collections/members/services/members.service';

describe('MembersService.listTeamMentions', () => {
  const prisma = {
    member: {
      findMany: vi.fn(),
    },
  };
  const logger = {
    warn: vi.fn(),
  };

  let service: MembersService;

  beforeEach(() => {
    prisma.member.findMany.mockReset();
    service = new MembersService(prisma as never, logger as never);
  });

  it('returns active organization members as team mentions', async () => {
    prisma.member.findMany.mockResolvedValue([
      {
        id: 'member-1',
        role: { key: 'admin', label: 'Admin' },
        roleKey: 'admin',
        user: {
          avatar: 'https://cdn.test/avatar.png',
          email: 'ada@example.com',
          firstName: 'Ada',
          handle: 'ada',
          id: 'user-1',
          isDeleted: false,
          lastName: 'Lovelace',
          name: null,
          platformRole: 'USER',
        },
      },
      {
        id: 'member-2',
        role: { key: 'agent_operator', label: 'Agent Operator' },
        roleKey: 'agent_operator',
        user: {
          avatar: null,
          email: 'agent@example.com',
          firstName: null,
          handle: 'agent',
          id: 'user-2',
          isDeleted: false,
          lastName: null,
          name: 'Agent Ops',
          platformRole: 'USER',
        },
      },
      {
        id: 'member-3',
        role: { key: 'member', label: 'Member' },
        roleKey: 'member',
        user: {
          avatar: null,
          email: 'deleted@example.com',
          firstName: null,
          handle: 'deleted',
          id: 'user-3',
          isDeleted: true,
          lastName: null,
          name: null,
          platformRole: 'USER',
        },
      },
    ]);

    const result = await service.listTeamMentions('org-1');

    expect(prisma.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        where: {
          isActive: true,
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expect(result).toEqual([
      {
        avatar: 'https://cdn.test/avatar.png',
        displayName: 'Ada Lovelace',
        id: 'member-1',
        isAgent: false,
        role: 'Admin',
      },
      {
        avatar: undefined,
        displayName: 'Agent Ops',
        id: 'member-2',
        isAgent: true,
        role: 'Agent Operator',
      },
    ]);
  });

  it('does not query without organization scope', async () => {
    const result = await service.listTeamMentions('');

    expect(result).toEqual([]);
    expect(prisma.member.findMany).not.toHaveBeenCalled();
  });
});
