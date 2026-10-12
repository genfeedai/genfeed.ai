import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { MembersService } from '@api/collections/members/services/members.service';
import { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';
import { OrganizationsSettingsController } from '@api/collections/organizations/controllers/organizations-settings.controller';
import { assertOrganizationSettingsPatchAllowed } from '@api/collections/organizations/utils/organization-settings-patch.util';
import { ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import {
  RolesGuard,
  type RolesGuardRequest,
} from '@api/helpers/guards/roles/roles.guard';
import { MemberRole } from '@genfeedai/contracts';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The per-organization opt-ins (#6526, #6727) are written through the one settings PATCH.
 * Their role check is server-side: owners and admins only, enforced by the roles guard on the
 * route, never by the UI.
 */
const AUTOMATION_SETTINGS = [
  'isBreakoutResponsesEnabled',
  'isBreakoutAutoPublishEnabled',
  'isBrandVisionChecksEnabled',
] as const;
const ORGANIZATION_ID = 'org-a';

function request(): RolesGuardRequest {
  return {
    body: Object.fromEntries(
      AUTOMATION_SETTINGS.map((setting) => [setting, true]),
    ),
    params: { organizationId: ORGANIZATION_ID },
    user: {
      organizationId: ORGANIZATION_ID,
      userId: 'user-a',
    } as unknown as AuthenticatedUser,
  } as unknown as RolesGuardRequest;
}

describe('organization automation settings: who may change them', () => {
  const members = { findOne: vi.fn() };
  const requiredRoles = Reflect.getMetadata(
    ROLES_KEY,
    OrganizationsSettingsController.prototype.updateSettings,
  ) as (string | MemberRole)[];
  let guard: RolesGuard;

  beforeEach(() => {
    members.findOne.mockReset();
    guard = new RolesGuard(
      new Reflector(),
      members as unknown as MembersService,
    );
  });

  const as = (role: MemberRole | null) =>
    members.findOne.mockResolvedValue(
      role === null ? null : { id: 'member-a', role: { key: role } },
    );

  it('declares the settings PATCH for superadmins, owners and admins only', () => {
    expect(requiredRoles).toEqual([
      'superadmin',
      MemberRole.OWNER,
      MemberRole.ADMIN,
    ]);
  });

  it.each([MemberRole.OWNER, MemberRole.ADMIN])(
    'lets an organization %s through',
    async (role) => {
      as(role);
      await expect(guard.assertRoles(request(), requiredRoles)).resolves.toBe(
        true,
      );
    },
  );

  it.each(
    Object.values(MemberRole).filter(
      (role) => role !== MemberRole.OWNER && role !== MemberRole.ADMIN,
    ),
  )('refuses an organization %s with 403', async (role) => {
    as(role);
    await expect(
      guard.assertRoles(request(), requiredRoles),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('refuses someone who is not a member of the organization', async () => {
    as(null);
    await expect(
      guard.assertRoles(request(), requiredRoles),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('is the only way in: the GET stays readable by members but carries no write', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        OrganizationsSettingsController.prototype.getSettings,
      ),
    ).toBeUndefined();
  });
});

describe('organization automation settings: what the PATCH accepts', () => {
  function dto(fields: Record<string, unknown>) {
    return plainToInstance(UpdateOrganizationSettingDto, fields);
  }

  it.each(AUTOMATION_SETTINGS)('accepts %s as a boolean', async (setting) => {
    for (const value of [true, false]) {
      const errors = await validate(dto({ [setting]: value }));
      expect(errors.filter((error) => error.property === setting)).toEqual([]);
    }
  });

  it.each(AUTOMATION_SETTINGS)(
    'refuses %s as anything but a boolean',
    async (setting) => {
      for (const value of ['true', 1, null, {}]) {
        const errors = await validate(dto({ [setting]: value }));
        expect(
          errors.filter((error) => error.property === setting),
        ).toHaveLength(1);
      }
    },
  );

  it('may be omitted: a patch of other settings never touches them', async () => {
    const errors = await validate(dto({ timezone: 'UTC' }));
    expect(
      errors.filter((error) =>
        (AUTOMATION_SETTINGS as readonly string[]).includes(error.property),
      ),
    ).toEqual([]);
  });

  it.each(AUTOMATION_SETTINGS)(
    'leaves %s to owners and admins: it is not a platform-only or billing setting',
    (setting) => {
      expect(() =>
        assertOrganizationSettingsPatchAllowed(dto({ [setting]: true }), false),
      ).not.toThrow();
    },
  );
});
