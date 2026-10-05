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
import type { CacheOptions } from '@api/shared/interfaces/cache/cache.interfaces';
import {
  adminUser,
  emptyPage,
  fieldValues,
  memberUser,
  sessionBrandId,
  sessionOrganizationId,
  targetBrandId,
  targetOrganizationId,
  tenantReadQuery,
  tenantReadRequest,
} from '@api-test/helpers/tenant-read.fixture';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

describe('UsersRelationshipsController tenant reads (#6176)', () => {
  async function setup() {
    const mock = vi.fn().mockResolvedValue(emptyPage());
    const module = await Test.createTestingModule({
      controllers: [UsersRelationshipsController],
      providers: [
        { provide: BrandsService, useValue: { findAll: mock } },
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
    return { controller, mock };
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

  it('separates cached reads by the effective organization', () => {
    const config = Reflect.getMetadata(
      'cache',
      UsersRelationshipsController.prototype.findMeBrands,
    );
    const first = config.keyGenerator(tenantReadRequest(adminUser));
    const second = config.keyGenerator(
      tenantReadRequest(adminUser, { organizationId: targetOrganizationId }),
    );
    const switched = config.keyGenerator(
      tenantReadRequest({ ...adminUser, organizationId: targetOrganizationId }),
    );
    expect(second).toContain(targetOrganizationId);
    expect(switched).toContain(targetOrganizationId);
    expect(second).not.toBe(first);
    expect(switched).not.toBe(first);
  });
});

describe('users-relationships.controller.findMeBrands cache authorization scope', () => {
  const config: CacheOptions = Reflect.getMetadata(
    'cache',
    UsersRelationshipsController.prototype.findMeBrands,
  );

  it('separates members with different session brands and the same query', () => {
    const query = { brandId: sessionBrandId };
    const first = config.keyGenerator?.(tenantReadRequest(memberUser, query));
    const second = config.keyGenerator?.(
      tenantReadRequest(
        {
          ...memberUser,
          id: 'another-member',
          userId: 'another-member',
          brandId: targetBrandId,
        },
        query,
      ),
    );
    const switched = config.keyGenerator?.(
      tenantReadRequest({ ...memberUser, brandId: targetBrandId }, query),
    );
    expect(first).toContain(sessionBrandId);
    expect(second).not.toBe(first);
    expect(switched).not.toBe(first);
  });

  it('separates session organizations under the same effective organization', () => {
    const query = {
      organizationId: targetOrganizationId,
      brandId: targetBrandId,
    };
    const first = config.keyGenerator?.(tenantReadRequest(adminUser, query));
    const second = config.keyGenerator?.(
      tenantReadRequest(
        { ...adminUser, organizationId: targetOrganizationId },
        query,
      ),
    );
    expect(first).toContain(targetOrganizationId);
    expect(second).not.toBe(first);
  });

  it('separates callers within the same session scope', () => {
    const query = { brandId: sessionBrandId };
    const first = config.keyGenerator?.(tenantReadRequest(memberUser, query));
    const second = config.keyGenerator?.(
      tenantReadRequest(
        { ...memberUser, id: 'another-member', userId: 'another-member' },
        query,
      ),
    );
    expect(first).toContain(memberUser.id);
    expect(second).not.toBe(first);
  });
});
