import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { Injectable } from '@nestjs/common';

export type AdminMemberRoleKey = 'admin' | 'member';

export interface AdminAddMemberInput {
  email: string;
  firstName?: string;
  lastName?: string;
  roleKey: AdminMemberRoleKey;
}

export interface AdminAddMemberResult {
  isMemberCreated: boolean;
  isUserCreated: boolean;
  memberId: string;
  organizationId: string;
  roleKey: string;
  userId: string;
}

function createHandle(email: string): string {
  const seed = (email.split('@')[0] ?? 'member')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `${seed || 'member'}-${randomUUID().slice(0, 8)}`;
}

/**
 * Adds a person to any organization on behalf of a platform super admin. The
 * member-scoped routes resolve the organization from the caller's own
 * memberships, and the only other way in is an invitation, which emails the
 * person. This path writes the membership directly and sends nothing.
 */
@Injectable()
export class AdminOrganizationMembersService {
  constructor(private readonly prisma: PrismaService) {}

  async addMember(
    organizationId: string,
    input: AdminAddMemberInput,
  ): Promise<AdminAddMemberResult> {
    const email = input.email.trim().toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      // tenant-scope-ignore: Organization and Role are looked up by id and key; the caller is a super admin behind the IP allow-list, and every Member query below is organization-scoped.
      const organization = await tx.organization.findFirst({
        select: { id: true },
        where: { id: organizationId, isDeleted: false },
      });
      if (!organization) {
        throw new NotFoundException('Organization', organizationId);
      }

      // tenant-scope-ignore: Role is a global catalogue, not a tenant table.
      const role = await tx.role.findFirst({
        select: { id: true, key: true },
        where: { isDeleted: false, key: input.roleKey },
      });
      if (!role) {
        throw new NotFoundException('Role', input.roleKey);
      }

      // tenant-scope-ignore: users are global; the lookup is by unique email.
      const existingUser = await tx.user.findFirst({
        select: { id: true },
        where: { email, isDeleted: false },
      });
      const firstName = input.firstName?.trim() || undefined;
      const lastName = input.lastName?.trim() || undefined;
      const user =
        existingUser ??
        (await tx.user.create({
          data: {
            email,
            firstName,
            handle: createHandle(email),
            isInvited: true,
            lastName,
            lastUsedOrganizationId: organizationId,
            name: [firstName, lastName].filter(Boolean).join(' ') || undefined,
          },
          select: { id: true },
        }));

      await tx.setting.upsert({
        create: { userId: user.id },
        update: { isDeleted: false },
        where: { userId: user.id },
      });

      const existingMember = await tx.member.findFirst({
        select: { id: true },
        where: scopedWhere(organizationId, { userId: user.id }),
      });
      if (existingMember) {
        await tx.member.updateMany({
          data: { isActive: true, roleId: role.id, roleKey: role.key },
          where: scopedWhere(organizationId, { id: existingMember.id }),
        });
        return {
          isMemberCreated: false,
          isUserCreated: !existingUser,
          memberId: existingMember.id,
          organizationId,
          roleKey: role.key,
          userId: user.id,
        };
      }

      // currentBrandId is required per member (#5219): default to the
      // organization's oldest brand, as invitation acceptance does.
      const defaultBrand = await tx.brand.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
        where: scopedWhere(organizationId),
      });
      if (!defaultBrand) {
        throw new NotFoundException('Brand', organizationId);
      }

      const member = await tx.member.create({
        data: {
          currentBrandId: defaultBrand.id,
          isActive: true,
          organizationId,
          roleId: role.id,
          roleKey: role.key,
          userId: user.id,
        },
        select: { id: true },
      });

      return {
        isMemberCreated: true,
        isUserCreated: !existingUser,
        memberId: member.id,
        organizationId,
        roleKey: role.key,
        userId: user.id,
      };
    });
  }
}
