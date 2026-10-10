import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UsersRelationshipsController } from '@api/collections/users/controllers/users-relationships.controller';
import { UsersService } from '@api/collections/users/services/users.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { NotificationPreferenceService } from '@api/services/notifications/workflow-notifications/notification-preference.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  adminUser,
  emptyPage,
  fieldValues,
  memberUser,
  sessionBrandId,
  sessionOrganizationId,
  targetOrganizationId,
  tenantReadQuery,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { MemberRole } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
}));

describe('UsersRelationshipsController tenant reads (#6176)', () => {
  async function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const findMembership = vi
      .fn()
      .mockResolvedValue({ role: { key: MemberRole.ADMIN }, brands: [] });
    const brandAccessService = new BrandAccessService({
      member: { findFirst: findMembership },
    } as unknown as PrismaService);
    const module = await Test.createTestingModule({
      controllers: [UsersRelationshipsController],
      providers: [
        {
          provide: BrandsService,
          useValue: { findAll: mock, brandAccessService },
        },
        { provide: UsersService, useValue: {} },
        { provide: OrganizationsService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        {
          provide: LoggerService,
          useValue: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        },
        {
          provide: MembersService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({ brands: [sessionBrandId] }),
          },
        },
        { provide: UserAccessCacheService, useValue: {} },
        { provide: NotificationPreferenceService, useValue: {} },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const controller = module.get<UsersRelationshipsController>(
      UsersRelationshipsController,
    );
    return { controller, mock, findMembership };
  }

  it('uses the target organization for a verified superadmin override', async () => {
    const { controller, mock } = await setup();
    const user = adminUser;
    const query = tenantReadQuery(BaseQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await controller.findMeBrands(user, request, query);
    const read = mock.mock.calls[0]?.[0];
    expect(fieldValues(read, 'organizationId')).toContain(targetOrganizationId);
    expect(fieldValues(read, 'organizationId')).not.toContain(
      sessionOrganizationId,
    );
    expect(fieldValues(read, 'isDeleted')).not.toContain(true);
    expect(fieldValues(read, 'brandId')).not.toContain(sessionBrandId);
  });

  it('rejects a member foreign organization before reading', async () => {
    const { controller, mock } = await setup();
    const user = memberUser;
    const query = tenantReadQuery(BaseQueryDto, {
      organizationId: targetOrganizationId,
    });
    const request = tenantReadRequest(user, query);
    await expect(controller.findMeBrands(user, request, query)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it('keeps the session organization for a member without an override', async () => {
    const { controller, mock } = await setup();
    const user = memberUser;
    const query = tenantReadQuery(BaseQueryDto, {});
    const request = tenantReadRequest(user);
    await controller.findMeBrands(user, request, query);
    expect(fieldValues(mock.mock.calls[0]?.[0], 'organizationId')).toContain(
      sessionOrganizationId,
    );
    expect(
      fieldValues(mock.mock.calls[0]?.[0], 'organizationId'),
    ).not.toContain(targetOrganizationId);
    expect(fieldValues(mock.mock.calls[0]?.[0], 'isDeleted')).not.toContain(
      true,
    );
  });

  it('reads live membership after brand assignments change', async () => {
    const { controller, mock, findMembership } = await setup();
    findMembership.mockResolvedValue({
      role: { key: MemberRole.USER },
      brands: [{ id: sessionBrandId }],
    });
    const request = tenantReadRequest(memberUser);
    const query = tenantReadQuery(BaseQueryDto, {});
    await controller.findMeBrands(memberUser, request, query);
    expect(mock.mock.calls[0][0].where.AND[0]).toEqual({
      organizationId: sessionOrganizationId,
      isDeleted: false,
      id: { in: [sessionBrandId] },
    });
    findMembership.mockResolvedValue({
      role: { key: MemberRole.USER },
      brands: [],
    });
    await controller.findMeBrands(memberUser, request, query);
    expect(mock.mock.calls[1][0].where.AND[0]).toEqual({
      organizationId: sessionOrganizationId,
      isDeleted: false,
      id: { in: [] },
    });
    expect(findMembership).toHaveBeenCalledTimes(2);
  });

  it('does not cache authorization-dependent brand lists', () => {
    expect(
      Reflect.getMetadata(
        'cache',
        UsersRelationshipsController.prototype.findMeBrands,
      ),
    ).toBeUndefined();
  });
});
