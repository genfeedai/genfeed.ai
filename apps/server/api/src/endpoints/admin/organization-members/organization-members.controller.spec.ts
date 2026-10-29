import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminOrganizationMembersController } from '@api/endpoints/admin/organization-members/organization-members.controller';
import { AdminOrganizationMembersService } from '@api/endpoints/admin/organization-members/organization-members.service';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

interface FakeMember {
  currentBrandId: string;
  id: string;
  isActive: boolean;
  organizationId: string;
  roleId: string;
  roleKey: string;
  userId: string;
}

interface FakeUser {
  email: string;
  id: string;
}

/** An in-memory stand-in for the slice of Prisma the service reads and writes. */
function createFakeDatabase(options: { hasBrand?: boolean } = {}) {
  const users: FakeUser[] = [];
  const members: FakeMember[] = [];
  const settings = new Set<string>();
  let nextId = 1;
  const newId = (prefix: string) => `${prefix}-${nextId++}`;

  const tx = {
    brand: {
      findFirst: async () =>
        options.hasBrand === false ? null : { id: 'brand-1' },
    },
    member: {
      create: async ({ data }: { data: Omit<FakeMember, 'id'> }) => {
        const member = { ...data, id: newId('member') };
        members.push(member);
        return member;
      },
      findFirst: async ({
        where,
      }: {
        where: { organizationId: string; userId: string };
      }) =>
        members.find(
          (member) =>
            member.organizationId === where.organizationId &&
            member.userId === where.userId,
        ) ?? null,
      updateMany: async ({
        data,
        where,
      }: {
        data: Partial<FakeMember>;
        where: { id: string };
      }) => {
        Object.assign(
          members.find((member) => member.id === where.id) ?? {},
          data,
        );
      },
    },
    organization: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        where.id === 'org-1' ? { id: 'org-1' } : null,
    },
    role: {
      findFirst: async ({ where }: { where: { key: string } }) =>
        ({ admin: { id: 'role-admin', key: 'admin' } })[where.key] ?? null,
    },
    setting: {
      upsert: async ({ create }: { create: { userId: string } }) => {
        settings.add(create.userId);
      },
    },
    user: {
      create: async ({ data }: { data: { email: string } }) => {
        const user = { email: data.email, id: newId('user') };
        users.push(user);
        return user;
      },
      findFirst: async ({ where }: { where: { email: string } }) =>
        users.find((user) => user.email === where.email) ?? null,
    },
  };
  const prisma = {
    $transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
  };

  return { members, prisma, settings, users };
}

function createController(options?: { hasBrand?: boolean }) {
  const database = createFakeDatabase(options);
  const service = new AdminOrganizationMembersService(database.prisma as never);
  return {
    ...database,
    controller: new AdminOrganizationMembersController(service),
  };
}

describe('admin organization members', () => {
  it('requires both IP allow-list and platform super-admin guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminOrganizationMembersController),
    ).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  it('creates the user, its settings and an admin membership in the path organization', async () => {
    const { controller, members, settings, users } = createController();

    const { data } = await controller.add('org-1', {
      email: ' Design@Example.com ',
    });

    expect(users.map((user) => user.email)).toEqual(['design@example.com']);
    expect(settings.has(data.userId)).toBe(true);
    expect(members).toEqual([
      {
        currentBrandId: 'brand-1',
        id: data.memberId,
        isActive: true,
        organizationId: 'org-1',
        roleId: 'role-admin',
        roleKey: 'admin',
        userId: data.userId,
      },
    ]);
    expect(data).toMatchObject({
      isMemberCreated: true,
      isUserCreated: true,
      roleKey: 'admin',
    });
  });

  it('is idempotent: a repeat call reuses the user and reactivates the same member', async () => {
    const { controller, members, users } = createController();
    const first = await controller.add('org-1', {
      email: 'design@example.com',
    });
    members[0].isActive = false;

    const second = await controller.add('org-1', {
      email: 'design@example.com',
    });

    expect(users).toHaveLength(1);
    expect(members).toHaveLength(1);
    expect(members[0].isActive).toBe(true);
    expect(second.data).toMatchObject({
      isMemberCreated: false,
      isUserCreated: false,
      memberId: first.data.memberId,
    });
  });

  it('rejects an unknown organization and writes nothing', async () => {
    const { controller, members, users } = createController();

    await expect(
      controller.add('org-missing', { email: 'design@example.com' }),
    ).rejects.toThrow(/not found/i);
    expect(users).toHaveLength(0);
    expect(members).toHaveLength(0);
  });

  it('rejects an organization without a brand', async () => {
    const { controller, members } = createController({ hasBrand: false });

    await expect(
      controller.add('org-1', { email: 'design@example.com' }),
    ).rejects.toThrow(/not found/i);
    expect(members).toHaveLength(0);
  });

  it('rejects an invalid email, an unknown role and extra fields', async () => {
    const { controller } = createController();

    for (const body of [
      { email: 'not-an-email' },
      { email: 'design@example.com', roleKey: 'owner' },
      { email: 'design@example.com', organizationId: 'org-2' },
    ]) {
      await expect(controller.add('org-1', body)).rejects.toThrow(
        /valid email/,
      );
    }
  });
});
