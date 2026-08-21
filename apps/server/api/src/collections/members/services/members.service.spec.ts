import { MembersService } from '@api/collections/members/services/members.service';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

describe('MembersService', () => {
  const prisma = {
    member: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: MembersService;

  beforeEach(() => {
    prisma.member.count.mockReset();
    prisma.member.create.mockReset();
    prisma.member.findMany.mockReset();
    prisma.member.update.mockReset();
    service = new MembersService(prisma as never, logger as never);
  });

  it('maps canonical brandIds to a Prisma relation set on create', async () => {
    prisma.member.create.mockResolvedValue({ id: 'member-1' });

    await service.create({
      brandIds: [
        'cmbrand000000000000000001',
        'cmbrand000000000000000001',
        'cmbrand000000000000000002',
      ],
      organizationId: 'cmorganization000000000000001',
      roleId: 'cmrole00000000000000000001',
      userId: 'cmuser0000000000000000001',
    });

    expect(prisma.member.create).toHaveBeenCalledWith({
      data: {
        brands: {
          set: [
            { id: 'cmbrand000000000000000001' },
            { id: 'cmbrand000000000000000002' },
          ],
        },
        organizationId: 'cmorganization000000000000001',
        roleId: 'cmrole00000000000000000001',
        userId: 'cmuser0000000000000000001',
      },
    });
  });

  it('maps canonical brandIds to a Prisma relation set on patch', async () => {
    prisma.member.update.mockResolvedValue({ id: 'member-1' });

    await service.patch('member-1', { brandIds: [] });

    expect(prisma.member.update).toHaveBeenCalledWith({
      data: { brands: { set: [] } },
      where: { id: 'member-1' },
    });
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

  it('finds active memberships by canonical user id during access discovery', async () => {
    prisma.member.findMany.mockResolvedValue([
      { id: 'member-1', organizationId: 'org-1', userId: 'user-1' },
    ]);

    const result = await service.findActiveForUserAccess('user-1');

    expect(result).toEqual([
      { id: 'member-1', organizationId: 'org-1', userId: 'user-1' },
    ]);
    expect(prisma.member.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        isDeleted: false,
        userId: 'user-1',
      },
    });
  });

  it('rejects access discovery membership lookup without a user id', async () => {
    await expect(service.findActiveForUserAccess('')).rejects.toThrow(
      'findActiveForUserAccess requires userId',
    );
    expect(prisma.member.findMany).not.toHaveBeenCalled();
  });

  it('counts members via a database count instead of loading every row', async () => {
    prisma.member.count.mockResolvedValue(3);

    const result = await service.count({
      isDeleted: false,
      organizationId: 'org-1',
    });

    expect(result).toBe(3);
    expect(prisma.member.count).toHaveBeenCalledWith({
      where: { isDeleted: false, organizationId: 'org-1' },
    });
  });
});
